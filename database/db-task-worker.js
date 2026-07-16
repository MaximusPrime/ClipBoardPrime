const { parentPort, workerData } = require('node:worker_threads');
const crypto = require('node:crypto');
const fs = require('node:fs');
const db = require('./db');
const { decryptBackup, encryptBackup, isEncryptedBackup } = require('../lib/backup-crypto');

function encryptText(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(workerData.encryptionKey, 'hex'),
    iv
  );
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  return `${iv.toString('hex')}.${encrypted.toString('hex')}.${cipher.getAuthTag().toString('hex')}`;
}

function fingerprintText(text) {
  return crypto
    .createHmac('sha256', Buffer.from(workerData.encryptionKey, 'hex'))
    .update(text || '', 'utf8')
    .digest('hex');
}

function decryptText(value) {
  if (!value) return '';
  const parts = value.split('.');
  if (parts.length !== 3) return value;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(workerData.encryptionKey, 'hex'),
    Buffer.from(parts[0], 'hex')
  );
  decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
  return decipher.update(parts[1], 'hex', 'utf8') + decipher.final('utf8');
}

function run() {
  db.initialize(workerData.dataDirectory, '', {
    encrypt: encryptText,
    decrypt: decryptText,
    fingerprint: fingerprintText,
  });

  switch (workerData.action) {
    case 'exportBackup': {
      const backup = encryptBackup(db.exportAll(), workerData.payload.password);
      fs.writeFileSync(workerData.payload.filePath, JSON.stringify(backup), {
        encoding: 'utf8',
        mode: 0o600,
      });
      return { path: workerData.payload.filePath };
    }
    case 'importBackup': {
      const parsed = JSON.parse(fs.readFileSync(workerData.payload.filePath, 'utf8'));
      const data = isEncryptedBackup(parsed)
        ? decryptBackup(parsed, workerData.payload.password)
        : parsed;
      return db.importAll(data);
    }
    case 'getStats':
      return db.getStats();
    case 'cleanupOrphanImages':
      db.cleanupOrphanImages();
      return true;
    default:
      throw new Error(`Desteklenmeyen veritabanı görevi: ${workerData.action}`);
  }
}

try {
  const result = run();
  db.close();
  parentPort.postMessage({ success: true, data: result });
} catch (error) {
  try { db.close(); } catch {}
  parentPort.postMessage({ success: false, error: error.message });
}
