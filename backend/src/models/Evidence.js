const mongoose = require('mongoose');

const custodyLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    actor: {
      type: String,
      required: true,
    },
    actorRole: {
      type: String,
      required: true,
    },
    note: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const evidenceSchema = new mongoose.Schema(
  {
    complaintId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complaint',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complaint',
      default: null,
      index: true,
    },
    captureMethod: {
      type: String,
      enum: ['SCREEN_CAPTURE', 'MANUAL_UPLOAD'],
      default: 'MANUAL_UPLOAD',
      index: true,
    },
    capturedAt: {
      type: Date,
      default: null,
      index: true,
    },
    sourceApplication: {
      type: String,
      default: 'unknown',
      trim: true,
    },
    deviceInformation: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },
    uploadStatus: {
      type: String,
      enum: ['pending', 'uploaded', 'failed', 'verified'],
      default: 'uploaded',
      index: true,
    },
    originalFilename: {
      type: String,
      required: true,
    },
    storagePath: {
      type: String,
      default: '',
      select: false,
    },
    storageId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    sha256Hash: {
      type: String,
      required: true,
      index: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    metadata: {
      fileName: { type: String, default: '' },
      fileSize: { type: Number, default: 0 },
      mimeType: { type: String, default: '' },
      captureTimestamp: { type: String, default: '' },
      timezone: { type: String, default: '' },
      sha256Hash: { type: String, default: '' },
      deviceModel: { type: String, default: '' },
      androidVersion: { type: String, default: '' },
      screenResolution: { type: String, default: '' },
      applicationInfo: { type: String, default: '' },
      incidentId: { type: String, default: '' },
      uploadStatus: { type: String, default: 'uploaded' },
      fileType: {
        type: String,
        default: '',
      },
      source: {
        type: String,
        default: '',
      },
      sourceDevice: {
        type: String,
        default: '',
      },
      collectedAt: {
        type: String,
        default: '',
      },
      transactionId: {
        type: String,
        default: '',
      },
      platformName: {
        type: String,
        default: '',
      },
      complaintCategory: {
        type: String,
        default: '',
      },
      captureMethod: {
        type: String,
        default: '',
      },
      captureLimitations: {
        type: String,
        default: '',
      },
    },
    uploadedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    custodyLog: {
      type: [custodyLogSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Evidence', evidenceSchema);
