const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');

function getBucket() {
  if (!mongoose.connection.db) {
    throw new Error('MongoDB connection is not ready');
  }
  return new GridFSBucket(mongoose.connection.db, { bucketName: 'evidence' });
}

function uploadBuffer(buffer, filename, metadata) {
  return new Promise((resolve, reject) => {
    const bucket = getBucket();
    const upload = bucket.openUploadStream(filename, { metadata });
    upload.once('error', reject);
    upload.once('finish', () => resolve(upload.id));
    upload.end(buffer);
  });
}

function downloadToResponse(fileId, response, filename, mimeType) {
  const bucket = getBucket();
  const id = new ObjectId(String(fileId));
  response.setHeader('Content-Type', mimeType || 'application/octet-stream');
  return new Promise((resolve, reject) => {
    const stream = bucket.openDownloadStream(id);
    stream.once('error', reject);
    stream.once('end', resolve);
    response.setHeader('Content-Disposition', `attachment; filename="${String(filename).replace(/["\r\n]/g, '_')}"`);
    stream.pipe(response);
  });
}

async function deleteFile(fileId) {
  if (!fileId) return;
  await getBucket().delete(new ObjectId(String(fileId)));
}

module.exports = { uploadBuffer, downloadToResponse, deleteFile };
