const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const db = require('../database/db');

function runTask(dataDirectory, action, payload) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve(__dirname, '../database/db-task-worker.js'), {
      workerData: {
        dataDirectory,
        action,
        payload,
        encryptionKey: crypto.randomBytes(32).toString('hex'),
      },
    });
    worker.once('message', (message) => {
      if (message.success) resolve(message.data);
      else reject(new Error(message.error));
    });
    worker.once('error', reject);
  });
}

test('veritabanı worker şifreli yedeği ana thread dışında oluşturur', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clipboard-prime-worker-'));
  const backupPath = path.join(directory, 'backup.cpbackup');
  try {
    db.initialize(directory);
    db.addNote({ title: 'Worker notu', content: 'İçerik' });
    db.close();

    const result = await runTask(directory, 'exportBackup', {
      filePath: backupPath,
      password: 'worker-parolası',
    });
    assert.equal(result.path, backupPath);
    const envelope = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    assert.equal(envelope.format, 'clipboard-prime-encrypted-backup');
    assert.equal(envelope.data.includes('Worker notu'), false);
  } finally {
    try { db.close(); } catch {}
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
