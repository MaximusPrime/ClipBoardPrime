const crypto = require('node:crypto');

const FORMAT = 'clipboard-prime-encrypted-backup';
const VERSION = 1;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Yedek parolası en az 8 karakter olmalıdır.');
  }
}

function encryptBackup(data, password) {
  assertPassword(password);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32, SCRYPT_OPTIONS);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(data), 'utf8')),
    cipher.final(),
  ]);

  return {
    format: FORMAT,
    version: VERSION,
    kdf: 'scrypt',
    cipher: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  };
}

function isEncryptedBackup(value) {
  return Boolean(value && value.format === FORMAT && value.version === VERSION);
}

function decryptBackup(envelope, password) {
  assertPassword(password);
  if (!isEncryptedBackup(envelope)) {
    throw new Error('Geçersiz veya desteklenmeyen şifreli yedek formatı.');
  }

  try {
    const key = crypto.scryptSync(
      password,
      Buffer.from(envelope.salt, 'base64'),
      32,
      SCRYPT_OPTIONS
    );
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(envelope.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new Error('Yedek parolası yanlış veya dosya bozulmuş.');
  }
}

module.exports = { decryptBackup, encryptBackup, isEncryptedBackup };
