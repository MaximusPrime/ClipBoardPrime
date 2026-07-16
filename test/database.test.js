const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const db = require('../database/db');

function createDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clipboard-prime-test-'));
  db.initialize(directory);
  return directory;
}

function cleanup(directory) {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}

test('hassas pano öğesi düzenlenirken gerçek karakter sayısını korur', () => {
  const directory = createDatabase();
  try {
    const item = db.addClipboardItem({
      content: 'ilk-değer',
      content_type: 'text',
      is_sensitive: 1,
    });
    const updated = db.updateClipboardItem(item.id, 'çok gizli değer');
    assert.equal(updated.char_count, 'çok gizli değer'.length);
  } finally {
    cleanup(directory);
  }
});

test('yedekten not favori ve sıralama alanlarını geri yükler', () => {
  const directory = createDatabase();
  try {
    const result = db.importAll({
      version: '1.0.0',
      data: {
        categories: [],
        clipboard_history: [],
        settings: [],
        notes: [{
          id: 42,
          title: 'Önemli not',
          content: 'İçerik',
          is_pinned: 1,
          is_favorite: 1,
          sort_order: 7,
          created_at: '2026-01-01T10:00:00.000Z',
          updated_at: '2026-01-02T10:00:00.000Z',
        }],
      },
    });

    assert.equal(result.notes, 1);
    const [note] = db.getNotes({ pinned: true });
    assert.equal(note.is_favorite, 1);
    assert.equal(note.sort_order, 7);
  } finally {
    cleanup(directory);
  }
});

test('veri taşıma mevcut veritabanının üzerine yazmayı reddeder', () => {
  const directory = createDatabase();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'clipboard-prime-target-'));
  fs.writeFileSync(path.join(target, 'clipboard-prime.db'), 'existing');
  try {
    assert.throws(
      () => db.changeLocation(target, directory),
      /mevcut bir ClipBoardPrime veritabanı/
    );
  } finally {
    cleanup(directory);
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('hassas mükerrerleri HMAC ile bulur ve rastgele şifreleme kullanır', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clipboard-prime-crypto-'));
  const key = crypto.randomBytes(32);
  const encrypt = (text) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}.${encrypted.toString('hex')}.${cipher.getAuthTag().toString('hex')}`;
  };
  const decrypt = (value) => {
    const [iv, encrypted, tag] = value.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  };
  const fingerprint = (text) => crypto.createHmac('sha256', key).update(text).digest('hex');

  try {
    db.initialize(directory, '', { encrypt, decrypt, fingerprint });
    const first = db.addClipboardItem({
      content: 'aynı gizli değer',
      content_type: 'text',
      is_sensitive: 1,
    });
    const second = db.addClipboardItem({
      content: 'aynı gizli değer',
      content_type: 'text',
      is_sensitive: 1,
    });
    assert.equal(second.id, first.id);

    const Database = require('better-sqlite3');
    const rawDb = new Database(path.join(directory, 'clipboard-prime.db'), { readonly: true });
    const raw = rawDb.prepare('SELECT content, content_hash FROM clipboard_history WHERE id = ?').get(first.id);
    rawDb.close();
    assert.notEqual(raw.content, 'aynı gizli değer');
    assert.equal(raw.content_hash, fingerprint('aynı gizli değer'));
  } finally {
    cleanup(directory);
  }
});

test('eski clipboard-pro veritabanı adını ClipBoardPrime adına taşır', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clipboard-prime-legacy-'));
  const legacyPath = path.join(directory, 'clipboard-pro.db');
  const primePath = path.join(directory, 'clipboard-prime.db');
  const Database = require('better-sqlite3');
  const legacyDb = new Database(legacyPath);
  legacyDb.exec('CREATE TABLE legacy_marker (value TEXT)');
  legacyDb.prepare('INSERT INTO legacy_marker (value) VALUES (?)').run('preserved');
  legacyDb.close();

  try {
    db.initialize(directory);
    assert.equal(fs.existsSync(legacyPath), false);
    assert.equal(fs.existsSync(primePath), true);
    const migratedDb = new Database(primePath, { readonly: true });
    const marker = migratedDb.prepare('SELECT value FROM legacy_marker').get();
    migratedDb.close();
    assert.equal(marker.value, 'preserved');
  } finally {
    cleanup(directory);
  }
});
