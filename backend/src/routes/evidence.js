const express = require('express');
const crypto = require('crypto');

const Complaint = require('../models/Complaint');
const Evidence = require('../models/Evidence');
const { uploadBuffer, downloadToResponse } = require('../utils/gridfs');
const {
  extractEvidenceMetadata,
  mergeMetadata,
  listAutoExtractedFields,
} = require('../utils/extractMetadata');
const { ROLES, isComplaintOwner, requireRole } = require('../middleware/access');
const { requireAuth } = require('../middleware/auth');
const { writeAuditLog } = require('../utils/audit');

const router = express.Router();

function cleanupUploadedFiles() {
  // Evidence is stored in GridFS; rejected memory uploads need no filesystem cleanup.
}


function getRequesterClientId(req) {
  return `user-${req.user.id}`;
}

function parseCaptureMethod(value) {
  return String(value || '').trim().toUpperCase() === 'SCREEN_CAPTURE'
    ? 'SCREEN_CAPTURE'
    : 'MANUAL_UPLOAD';
}

function parseCapturedAt(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function parseEvidenceMetadata(input = {}) {
  const fallback = {
    fileName: '',
    fileSize: 0,
    mimeType: '',
    captureTimestamp: '',
    timezone: '',
    sha256Hash: '',
    deviceModel: '',
    androidVersion: '',
    screenResolution: '',
    applicationInfo: '',
    incidentId: '',
    uploadStatus: '',
    fileType: '',
    source: '',
    sourceDevice: '',
    collectedAt: '',
    transactionId: '',
    platformName: '',
    complaintCategory: '',
    captureMethod: '',
    captureLimitations: '',
  };

  if (!input || typeof input !== 'object') {
    return fallback;
  }

  return {
    fileName: String(input.fileName || '').trim(),
    fileSize: Number(input.fileSize || 0),
    mimeType: String(input.mimeType || '').trim(),
    captureTimestamp: String(input.captureTimestamp || '').trim(),
    timezone: String(input.timezone || '').trim(),
    sha256Hash: String(input.sha256Hash || '').trim(),
    deviceModel: String(input.deviceModel || '').trim(),
    androidVersion: String(input.androidVersion || '').trim(),
    screenResolution: String(input.screenResolution || '').trim(),
    applicationInfo: String(input.applicationInfo || '').trim(),
    incidentId: String(input.incidentId || '').trim(),
    uploadStatus: String(input.uploadStatus || '').trim(),
    fileType: String(input.fileType || '').trim(),
    source: String(input.source || '').trim(),
    sourceDevice: String(input.sourceDevice || '').trim(),
    collectedAt: String(input.collectedAt || '').trim(),
    transactionId: String(input.transactionId || '').trim(),
    platformName: String(input.platformName || '').trim(),
    complaintCategory: String(input.complaintCategory || '').trim(),
    captureMethod: String(input.captureMethod || '').trim(),
    captureLimitations: String(input.captureLimitations || '').trim(),
  };
}

function validateMetadata(metadata) {
  const required = ['fileName', 'fileSize', 'mimeType'];
  const missing = required.filter((field) => !String(metadata[field] || '').trim());
  if (missing.length) {
    return `Missing evidence metadata fields: ${missing.join(', ')}`;
  }
  return null;
}

async function authorizeComplaintAccess(req, complaintId) {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint) {
    return null;
  }

  if (req.user.role === ROLES.VICTIM) {
    const isOwner = isComplaintOwner(complaint, getRequesterClientId(req));
    if (!isOwner) {
      return null;
    }
  }

  return complaint;
}

const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 10, fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = /^(image|video|audio)\//.test(file.mimetype)
      || ['application/pdf', 'text/plain', 'text/csv', 'application/json',
        'application/zip', 'application/x-zip-compressed',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.mimetype);
    if (!allowed) {
      return callback(new Error(`Unsupported evidence file type: ${file.mimetype || 'unknown'}`));
    }
    return callback(null, true);
  },
});

const previewUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.use(requireAuth());
router.use(requireRole([ROLES.VICTIM, ROLES.SUPPORT, ROLES.POLICE, ROLES.ADMIN]));

router.post(
  '/:complaintId/extract-metadata',
  requireRole([ROLES.VICTIM, ROLES.SUPPORT, ROLES.ADMIN]),
  previewUpload.single('file'),
  async (req, res, next) => {
    try {
      const complaint = await authorizeComplaintAccess(req, req.params.complaintId);
      if (!complaint) {
        return res.status(404).json({ message: 'Complaint not found' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'A file is required for metadata extraction' });
      }

      let manual = {};
      if (req.body.metadataJson) {
        try {
          manual = JSON.parse(req.body.metadataJson);
        } catch (error) {
          return res.status(400).json({ message: 'metadataJson must be valid JSON' });
        }
      }

      const auto = await extractEvidenceMetadata({
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        complaint,
        userAgent: req.headers['user-agent'],
        lastModified: req.body.lastModified,
      });
      const metadata = mergeMetadata(auto, parseEvidenceMetadata(manual));

      return res.json({
        metadata,
        autoExtracted: listAutoExtractedFields(auto, metadata),
        message: 'Metadata extracted automatically from file',
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(['/upload', '/:complaintId/upload'], requireRole([ROLES.VICTIM, ROLES.SUPPORT, ROLES.ADMIN]), upload.array('files', 10), async (req, res, next) => {
  try {
    const complaintId = req.params.complaintId || String(req.body.incidentId || '').trim();
    if (!complaintId) {
      return res.status(400).json({ message: 'incidentId is required for unified evidence upload' });
    }
    const complaint = await authorizeComplaintAccess(req, complaintId);
    if (!complaint) {
      cleanupUploadedFiles(req.files);
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (!req.files || !req.files.length) {
      return res.status(400).json({ message: 'At least one file is required' });
    }

    let manualMetadata = {};
    if (req.body.metadataJson) {
      try {
        manualMetadata = JSON.parse(req.body.metadataJson);
      } catch (error) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({ message: 'metadataJson must be valid JSON' });
      }
    } else {
      manualMetadata = req.body.metadata || req.body;
    }
    const parsedManualMetadata = parseEvidenceMetadata(manualMetadata);

    const createdEvidence = [];
    const createdIds = [];
    const createdStorageIds = [];

    try {
      for (const file of req.files) {
        const autoMetadata = await extractEvidenceMetadata({
          buffer: file.buffer,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          complaint,
          userAgent: req.headers['user-agent'],
        });
        const parsedMetadata = {
          ...mergeMetadata(autoMetadata, parsedManualMetadata),
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          captureTimestamp: parsedManualMetadata.captureTimestamp || new Date().toISOString(),
          sha256Hash: '',
          uploadStatus: 'uploaded',
        };
        const metadataError = validateMetadata(parsedMetadata);
        if (metadataError) {
          throw new Error(metadataError);
        }

        const sha256Hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
        let clientHashes = {};
        if (req.body.clientHashes) {
          try {
            clientHashes = JSON.parse(req.body.clientHashes);
          } catch (error) {
            throw new Error('clientHashes must be valid JSON');
          }
        }
        const clientHash = String(
          clientHashes[String(req.files.indexOf(file))] ||
          clientHashes[file.originalname] ||
          parsedManualMetadata.sha256Hash ||
          req.body.sha256 ||
          ''
        ).trim().toLowerCase();
        if (clientHash && clientHash !== sha256Hash) {
          throw new Error(`SHA-256 verification failed for ${file.originalname}`);
        }
        parsedMetadata.sha256Hash = sha256Hash;
        parsedMetadata.uploadStatus = 'verified';
        const storageId = await uploadBuffer(file.buffer, file.originalname, {
          complaintId: String(complaint._id),
          mimeType: file.mimetype,
          sha256Hash,
        });
        createdStorageIds.push(storageId);
        const evidence = await Evidence.create({
          complaintId: complaint._id,
          userId: req.user.id,
          incidentId: complaint._id,
          capturedAt: parseCapturedAt(parsedMetadata.captureTimestamp),
          captureMethod: parseCaptureMethod(req.body.captureMethod || parsedManualMetadata.captureMethod),
          sourceApplication: String(req.body.sourceApplication || parsedManualMetadata.applicationInfo || 'unknown').trim(),
          deviceInformation: {
            model: parsedManualMetadata.deviceModel,
            androidVersion: parsedManualMetadata.androidVersion,
            screenResolution: parsedManualMetadata.screenResolution,
          },
          description: String(req.body.description || '').trim(),
          uploadStatus: 'verified',
          originalFilename: file.originalname,
          storageId,
          sha256Hash,
          fileSize: file.size,
          mimeType: file.mimetype,
          metadata: parsedMetadata,
          uploadedAt: new Date(),
          custodyLog: [
            {
              action: 'uploaded',
              timestamp: new Date(),
              actor: req.user.displayName,
              actorRole: req.user.role,
              note: 'Uploaded, hashed, and metadata auto-extracted by platform',
            },
          ],
        });

        createdIds.push(evidence._id);
        createdEvidence.push({
          _id: evidence._id,
          originalFilename: evidence.originalFilename,
          sha256Hash: evidence.sha256Hash,
          fileSize: evidence.fileSize,
          uploadedAt: evidence.uploadedAt,
          metadata: evidence.metadata,
          autoExtracted: listAutoExtractedFields(autoMetadata, parsedMetadata),
          custodyLog: evidence.custodyLog,
        });
      }
    } catch (uploadError) {
      if (createdIds.length) {
        await Evidence.deleteMany({ _id: { $in: createdIds } });
      }
      const { deleteFile } = require('../utils/gridfs');
      await Promise.all(createdStorageIds.map((storageId) => deleteFile(storageId)));
      cleanupUploadedFiles(req.files);
      if (
        uploadError.message?.startsWith('Missing evidence metadata') ||
        uploadError.message?.startsWith('SHA-256 verification failed') ||
        uploadError.message?.startsWith('clientHashes must be valid JSON')
      ) {
        return res.status(400).json({ message: uploadError.message });
      }
      return next(uploadError);
    }

    await writeAuditLog({
      req,
      action: 'evidence.upload',
      statusCode: 201,
      metadata: { complaintId: String(complaint._id), fileCount: createdEvidence.length },
    });

    return res.status(201).json({
      success: true,
      message: 'Evidence uploaded, metadata auto-extracted, hashed, and logged successfully',
      hashGenerated: true,
      metadataAutoExtracted: true,
      evidences: createdEvidence,
      provenanceNotice:
        'Hashing confirms integrity after capture/upload. It cannot prove evidence was unaltered before upload; capture source and method are documented for review.',
    });
  } catch (error) {
    cleanupUploadedFiles(req.files);
    if (
      error.message?.startsWith('Missing evidence metadata') ||
      error.message?.startsWith('SHA-256 verification failed') ||
      error.message?.startsWith('clientHashes must be valid JSON')
    ) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const filter = req.user.role === ROLES.VICTIM ? { userId: req.user.id } : {};
    const evidences = await Evidence.find(filter).sort({ capturedAt: -1, uploadedAt: -1 }).lean();
    return res.json({ success: true, evidences });
  } catch (error) {
    return next(error);
  }
});

router.get('/:evidenceId', async (req, res, next) => {
  try {
    const evidence = await Evidence.findById(req.params.evidenceId).lean();
    if (!evidence) return res.status(404).json({ message: 'Evidence not found' });
    if (req.user.role === ROLES.VICTIM && String(evidence.userId) !== req.user.id) {
      return res.status(404).json({ message: 'Evidence not found' });
    }
    return res.json({ success: true, evidence });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:evidenceId', requireRole([ROLES.VICTIM, ROLES.SUPPORT, ROLES.ADMIN]), async (req, res, next) => {
  try {
    const evidence = await Evidence.findById(req.params.evidenceId);
    if (!evidence) return res.status(404).json({ message: 'Evidence not found' });
    if (req.user.role === ROLES.VICTIM && String(evidence.userId) !== req.user.id) {
      return res.status(404).json({ message: 'Evidence not found' });
    }
    const { deleteFile } = require('../utils/gridfs');
    await deleteFile(evidence.storageId);
    await evidence.deleteOne();
    return res.json({ success: true, message: 'Evidence deleted successfully' });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:evidenceId/metadata', requireRole([ROLES.SUPPORT, ROLES.ADMIN]), async (req, res, next) => {
  try {
    const evidence = await Evidence.findById(req.params.evidenceId);
    if (!evidence) {
      return res.status(404).json({ message: 'Evidence not found' });
    }
    const complaint = await authorizeComplaintAccess(req, evidence.complaintId);
    if (!complaint) {
      return res.status(404).json({ message: 'Evidence not found' });
    }

    const metadata = parseEvidenceMetadata(req.body.metadata || req.body);
    const metadataError = validateMetadata(metadata);
    if (metadataError) {
      return res.status(400).json({ message: metadataError });
    }

    evidence.metadata = metadata;
    evidence.custodyLog.push({
      action: 'edited',
      timestamp: new Date(),
      actor: req.user.displayName,
      actorRole: req.user.role,
      note: 'Evidence metadata updated',
    });
    await evidence.save();

    await writeAuditLog({
      req,
      action: 'evidence.metadata_update',
      statusCode: 200,
      metadata: { evidenceId: String(evidence._id) },
    });

    return res.json({
      message: 'Evidence metadata updated',
      evidence,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:evidenceId/download', requireRole([ROLES.VICTIM, ROLES.SUPPORT, ROLES.POLICE, ROLES.ADMIN]), async (req, res, next) => {
  try {
    const evidence = await Evidence.findById(req.params.evidenceId);
    if (!evidence) {
      return res.status(404).json({ message: 'Evidence not found' });
    }
    if (!evidence.storageId) {
      return res.status(404).json({ message: 'Evidence file is not available in database storage' });
    }

    const complaint = await authorizeComplaintAccess(req, evidence.complaintId);
    if (!complaint) {
      return res.status(404).json({ message: 'Evidence not found' });
    }

    evidence.custodyLog.push({
      action: 'exported',
      timestamp: new Date(),
      actor: req.user.displayName,
      actorRole: req.user.role,
      note: 'Evidence downloaded',
    });
    await evidence.save();

    await writeAuditLog({
      req,
      action: 'evidence.download',
      statusCode: 200,
      metadata: { evidenceId: String(evidence._id), complaintId: String(complaint._id) },
    });

    return downloadToResponse(evidence.storageId, res, evidence.originalFilename, evidence.mimeType);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
