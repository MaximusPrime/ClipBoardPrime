const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
  fs.writeFileSync(path.join(target, 'clipboard-pro.db'), 'existing');
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
