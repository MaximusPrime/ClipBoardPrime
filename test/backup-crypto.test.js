const test = require('node:test');
const assert = require('node:assert/strict');
const { decryptBackup, encryptBackup, isEncryptedBackup } = require('../lib/backup-crypto');

test('şifreli yedek doğru parola ile geri açılır', () => {
  const source = { version: '1.0.0', data: { notes: [{ title: 'Gizli' }] } };
  const encrypted = encryptBackup(source, 'güçlü-parola-123');
  assert.equal(isEncryptedBackup(encrypted), true);
  assert.deepEqual(decryptBackup(encrypted, 'güçlü-parola-123'), source);
});

test('şifreli yedek yanlış parolayı reddeder', () => {
  const encrypted = encryptBackup({ data: {} }, 'doğru-parola');
  assert.throws(() => decryptBackup(encrypted, 'yanlış-parola'), /parolası yanlış/);
});

test('kısa yedek parolasını reddeder', () => {
  assert.throws(() => encryptBackup({}, '123'), /en az 8 karakter/);
});
