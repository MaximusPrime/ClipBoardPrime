/**
 * ClipBoard Pro — Veritabanı Modülü
 * ====================================
 * better-sqlite3 kullanarak senkron SQLite işlemleri.
 * WAL modu, prepared statements ve tam CRUD desteği.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;
let dbPath = null;

// ─── Varsayılan Ayarlar ──────────────────────────────────────
const DEFAULT_SETTINGS = {
  theme: 'dark',
  maxHistory: '0',
  pollingInterval: '500',
  startWithWindows: 'false',
  dataLocation: '',
  globalShortcut: 'Ctrl+Shift+V',
  showPreview: 'true',
  detectSensitive: 'true',
};

// ─── Varsayılan Kategoriler ──────────────────────────────────
const DEFAULT_CATEGORIES = [
  { name: 'Genel', icon: 'folder', color: '#6b7280', sort_order: 0 },
  { name: 'İş', icon: 'briefcase', color: '#6b7280', sort_order: 1 },
  { name: 'Kod', icon: 'code', color: '#6b7280', sort_order: 2 },
  { name: 'Kişisel', icon: 'user', color: '#6b7280', sort_order: 3 },
];

// ═══════════════════════════════════════════════════════════════
// Başlatma & Bağlantı
// ═══════════════════════════════════════════════════════════════

/**
 * Veritabanını başlatır.
 * @param {string} userDataPath - Electron app.getPath('userData') değeri
 * @param {string} [customLocation] - Kullanıcının seçtiği özel veri konumu
 */
function initialize(userDataPath, customLocation) {
  try {
    // Veritabanı konumunu belirle
    const baseDir = customLocation && customLocation.length > 0
      ? customLocation
      : userDataPath;

    // Klasör yoksa oluştur
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    dbPath = path.join(baseDir, 'clipboard-pro.db');
    db = new Database(dbPath);

    // Performans ayarları
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('cache_size = -8000'); // 8MB cache

    // Tabloları oluştur
    createTables();

    // Migrasyon: Notes sort_order
    migrateNoteSortOrder();

    // Migrasyon: Eski emoji kategorilerini temizle
    migrateCategoryIcons();

    // Migrasyon: Eski metin formatındaki URL'leri 'url' tipine dönüştür
    migrateExistingUrls();

    // Varsayılan verileri ekle
    seedDefaults();

    return true;
  } catch (err) {
    console.error('Veritabanı başlatma hatası:', err);
    throw err;
  }
}

/**
 * Tabloları oluşturur.
 */
function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clipboard_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      content_type TEXT DEFAULT 'text',
      preview TEXT,
      image_path TEXT,
      is_pinned INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      is_sensitive INTEGER DEFAULT 0,
      source_app TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      char_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category_id INTEGER,
      color TEXT DEFAULT '#3b82f6',
      is_pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT '📁',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- İndeksler
    CREATE INDEX IF NOT EXISTS idx_clipboard_created_at ON clipboard_history(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_clipboard_content_type ON clipboard_history(content_type);
    CREATE INDEX IF NOT EXISTS idx_clipboard_is_pinned ON clipboard_history(is_pinned);
    CREATE INDEX IF NOT EXISTS idx_clipboard_is_favorite ON clipboard_history(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_notes_category_id ON notes(category_id);
    CREATE INDEX IF NOT EXISTS idx_notes_is_pinned ON notes(is_pinned);
    CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
  `);
}

/**
 * Notes tablosuna sort_order kolonu ekler (migration).
 */
function migrateNoteSortOrder() {
  try {
    const columns = db.pragma('table_info(notes)');
    const hasSortOrder = columns.some(c => c.name === 'sort_order');
    if (!hasSortOrder) {
      db.exec('ALTER TABLE notes ADD COLUMN sort_order INTEGER DEFAULT 0');
    }
  } catch (err) {
    console.error('Notes sort_order migration hatası:', err);
  }
}

/**
 * Varsayılan ayarları ve kategorileri ekler (yoksa).
 */
function seedDefaults() {
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  const insertSettingMany = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insertSetting.run(key, value);
    }
  });
  insertSettingMany();

  const insertCategory = db.prepare(
    'INSERT OR IGNORE INTO categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)'
  );
  const insertCategoryMany = db.transaction(() => {
    for (const cat of DEFAULT_CATEGORIES) {
      insertCategory.run(cat.name, cat.icon, cat.color, cat.sort_order);
    }
  });
  insertCategoryMany();
}

/**
 * Eski emoji kategorilerini premium ikon isimlerine taşır.
 */
function migrateCategoryIcons() {
  try {
    const updateIcon = db.prepare("UPDATE categories SET icon = ? WHERE icon = ?");
    db.transaction(() => {
      updateIcon.run('folder', '📁');
      updateIcon.run('briefcase', '💼');
      updateIcon.run('code', '💻');
      updateIcon.run('user', '🏠');
    })();
    // Tüm kategorileri gri yap
    db.prepare("UPDATE categories SET color = '#6b7280'").run();
  } catch (err) {
    console.error('Kategori ikon migrasyon hatası:', err);
  }
}

/**
 * Eski metin olarak kaydedilmiş URL'leri 'url' tipine dönüştürür.
 */
function migrateExistingUrls() {
  try {
    db.exec(`
      UPDATE clipboard_history 
      SET content_type = 'url' 
      WHERE content_type = 'text' 
        AND (content LIKE 'http://%' OR content LIKE 'https://%' OR content LIKE 'www.%')
    `);
  } catch (err) {
    console.error('URL migrasyon hatası:', err);
  }
}

/**
 * Veritabanı bağlantısını kapatır.
 */
function close() {
  if (db) {
    try {
      db.close();
      db = null;
    } catch (err) {
      console.error('Veritabanı kapatma hatası:', err);
    }
  }
}

/**
 * Veritabanının aktif olup olmadığını kontrol eder.
 */
function isReady() {
  return db !== null && db.open;
}

// ═══════════════════════════════════════════════════════════════
// Clipboard History CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Yeni clipboard öğesi ekler.
 * @param {Object} item - { content, content_type, preview, image_path, is_sensitive, source_app, char_count }
 * @returns {Object} Eklenen öğe (id dahil)
 */
function addClipboardItem(item) {
  console.log('db.addClipboardItem çağrıldı! item:', JSON.stringify(item));
  // Mükerrerlik Kontrolü
  let existing = null;
  if (item.content_type === 'image') {
    if (item.image_path) {
      existing = db.prepare('SELECT id FROM clipboard_history WHERE image_path = ?').get(item.image_path);
    }
  } else {
    existing = db.prepare('SELECT id FROM clipboard_history WHERE content = ? AND content_type = ?').get(
      item.content,
      item.content_type || 'text'
    );
  }

  if (existing) {
    db.prepare("UPDATE clipboard_history SET created_at = datetime('now','localtime') WHERE id = ?").run(existing.id);
    return getClipboardItemById(existing.id);
  }

  const stmt = db.prepare(`
    INSERT INTO clipboard_history (content, content_type, preview, image_path, is_sensitive, source_app, char_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const preview = item.preview || (
    item.content_type === 'text'
      ? item.content.substring(0, 200)
      : item.content_type === 'html'
        ? item.content.replace(/<[^>]*>/g, '').substring(0, 200)
        : ''
  );

  const result = stmt.run(
    item.content,
    item.content_type || 'text',
    preview,
    item.image_path || null,
    item.is_sensitive || 0,
    item.source_app || null,
    item.char_count || (item.content ? item.content.length : 0)
  );

  // maxHistory kontrolü
  enforceMaxHistory();

  return getClipboardItemById(result.lastInsertRowid);
}

/**
 * Tek bir clipboard öğesini id ile getirir.
 */
function getClipboardItemById(id) {
  const stmt = db.prepare('SELECT * FROM clipboard_history WHERE id = ?');
  return stmt.get(id) || null;
}

/**
 * Clipboard geçmişini sayfalama, filtreleme ve arama ile getirir.
 * @param {Object} params - { page, limit, search, type, pinned, favorite }
 * @returns {Object} { items: [], total: number, page, limit }
 */
function getClipboardHistory(params = {}) {
  const page = Math.max(1, parseInt(params.page) || 1);
  const limit = Math.max(1, Math.min(200, parseInt(params.limit) || 50));
  const offset = (page - 1) * limit;

  let whereClauses = [];
  let queryParams = [];

  // Arama filtresi
  if (params.search && params.search.trim().length > 0) {
    whereClauses.push('(content LIKE ? OR preview LIKE ?)');
    const searchTerm = `%${params.search.trim()}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  // Tür filtresi
  if (params.type && params.type !== 'all') {
    whereClauses.push('content_type = ?');
    queryParams.push(params.type);
  }

  // Pinned filtresi
  if (params.pinned !== undefined && params.pinned !== null) {
    whereClauses.push('is_pinned = ?');
    queryParams.push(params.pinned ? 1 : 0);
  }

  // Favorite filtresi
  if (params.favorite !== undefined && params.favorite !== null) {
    whereClauses.push('is_favorite = ?');
    queryParams.push(params.favorite ? 1 : 0);
  }

  const whereSQL = whereClauses.length > 0
    ? 'WHERE ' + whereClauses.join(' AND ')
    : '';

  // Toplam sayı
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM clipboard_history ${whereSQL}`);
  const { total } = countStmt.get(...queryParams);

  // Öğeler — pinned öğeler her zaman üstte
  const orderClause = params.pinned ? 'ORDER BY is_pinned DESC, created_at DESC' : 'ORDER BY created_at DESC';
  
  const itemsStmt = db.prepare(`
    SELECT * FROM clipboard_history ${whereSQL}
    ${orderClause}
    LIMIT ? OFFSET ?
  `);
  const items = itemsStmt.all(...queryParams, limit, offset);

  return { items, total, page, limit };
}

/**
 * Clipboard öğesini siler.
 */
function deleteClipboardItem(id) {
  const item = getClipboardItemById(id);

  // Eğer görsel ise dosyayı da sil
  if (item && item.image_path) {
    try {
      if (fs.existsSync(item.image_path)) {
        fs.unlinkSync(item.image_path);
      }
    } catch (err) {
      console.error('Görsel dosya silme hatası:', err);
    }
  }

  const stmt = db.prepare('DELETE FROM clipboard_history WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Pinned hariç tüm clipboard geçmişini temizler.
 */
function clearHistory() {
  // Silinecek görsellerin yollarını al
  const images = db.prepare(
    "SELECT image_path FROM clipboard_history WHERE is_pinned = 0 AND image_path IS NOT NULL"
  ).all();

  // Görsel dosyaları sil
  for (const img of images) {
    try {
      if (img.image_path && fs.existsSync(img.image_path)) {
        fs.unlinkSync(img.image_path);
      }
    } catch (err) {
      console.error('Görsel dosya silme hatası:', err);
    }
  }

  const stmt = db.prepare('DELETE FROM clipboard_history WHERE is_pinned = 0');
  const result = stmt.run();
  return result.changes;
}

/**
 * Clipboard öğesinin pin durumunu değiştirir.
 */
function togglePin(id) {
  const stmt = db.prepare(
    'UPDATE clipboard_history SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END WHERE id = ?'
  );
  stmt.run(id);
  return getClipboardItemById(id);
}

/**
 * Clipboard öğesinin favori durumunu değiştirir.
 */
function toggleFavorite(id) {
  const stmt = db.prepare(
    'UPDATE clipboard_history SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?'
  );
  stmt.run(id);
  return getClipboardItemById(id);
}

/**
 * maxHistory ayarına göre eski öğeleri siler (pinned hariç).
 */
function enforceMaxHistory() {
  const maxHistorySetting = getSetting('maxHistory');
  const maxHistory = parseInt(maxHistorySetting) || 0;

  if (maxHistory <= 0) return; // 0 = sınırsız

  const countStmt = db.prepare(
    'SELECT COUNT(*) as total FROM clipboard_history WHERE is_pinned = 0'
  );
  const { total } = countStmt.get();

  if (total > maxHistory) {
    const excess = total - maxHistory;

    // Silinecek görsellerin yollarını al
    const images = db.prepare(`
      SELECT image_path FROM clipboard_history
      WHERE is_pinned = 0 AND image_path IS NOT NULL
      ORDER BY created_at ASC
      LIMIT ?
    `).all(excess);

    for (const img of images) {
      try {
        if (img.image_path && fs.existsSync(img.image_path)) {
          fs.unlinkSync(img.image_path);
        }
      } catch (err) {
        console.error('Görsel dosya silme hatası:', err);
      }
    }

    const deleteStmt = db.prepare(`
      DELETE FROM clipboard_history WHERE id IN (
        SELECT id FROM clipboard_history
        WHERE is_pinned = 0
        ORDER BY created_at ASC
        LIMIT ?
      )
    `);
    deleteStmt.run(excess);
  }
}

// ═══════════════════════════════════════════════════════════════
// Notes CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Yeni not oluşturur.
 * @param {Object} note - { title, content, category_id, color, is_pinned }
 * @returns {Object} Oluşturulan not
 */
function addNote(note) {
  const stmt = db.prepare(`
    INSERT INTO notes (title, content, category_id, color, is_pinned)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    note.title || 'Başlıksız Not',
    note.content || '',
    note.category_id || null,
    note.color || '#3b82f6',
    note.is_pinned || 0
  );
  return getNoteById(result.lastInsertRowid);
}

/**
 * Varolan notu günceller.
 * @param {Object} note - { id, title, content, category_id, color, is_pinned }
 * @returns {Object} Güncellenen not
 */
function updateNote(note) {
  const stmt = db.prepare(`
    UPDATE notes SET
      title = ?,
      content = ?,
      category_id = ?,
      color = ?,
      is_pinned = ?,
      updated_at = datetime('now','localtime')
    WHERE id = ?
  `);
  stmt.run(
    note.title || 'Başlıksız Not',
    note.content || '',
    note.category_id || null,
    note.color || '#3b82f6',
    note.is_pinned || 0,
    note.id
  );
  return getNoteById(note.id);
}

/**
 * Tek bir notu id ile getirir.
 */
function getNoteById(id) {
  const stmt = db.prepare(`
    SELECT n.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM notes n
    LEFT JOIN categories c ON n.category_id = c.id
    WHERE n.id = ?
  `);
  return stmt.get(id) || null;
}

/**
 * Notları getirir (opsiyonel filtreleme ile).
 * @param {Object} params - { search, category_id }
 * @returns {Array} Notlar listesi
 */
function getNotes(params = {}) {
  let whereClauses = [];
  let queryParams = [];

  if (params.search && params.search.trim().length > 0) {
    whereClauses.push('(n.title LIKE ? OR n.content LIKE ?)');
    const searchTerm = `%${params.search.trim()}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  if (params.category_id !== undefined && params.category_id !== null) {
    whereClauses.push('n.category_id = ?');
    queryParams.push(params.category_id);
  }

  const whereSQL = whereClauses.length > 0
    ? 'WHERE ' + whereClauses.join(' AND ')
    : '';

  const stmt = db.prepare(`
    SELECT n.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM notes n
    LEFT JOIN categories c ON n.category_id = c.id
    ${whereSQL}
    ORDER BY n.is_pinned DESC, n.sort_order ASC, n.updated_at DESC
  `);

  return stmt.all(...queryParams);
}

/**
 * Notu siler.
 */
function deleteNote(id) {
  const stmt = db.prepare('DELETE FROM notes WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Sabitlenen notların sırasını günceller.
 * @param {Array} orderedIds - Sıralı not ID'leri [{id, sort_order}]
 */
function reorderNotes(orderedIds) {
  const stmt = db.prepare('UPDATE notes SET sort_order = ? WHERE id = ?');
  const updateMany = db.transaction(() => {
    for (const item of orderedIds) {
      stmt.run(item.sort_order, item.id);
    }
  });
  updateMany();
  return true;
}

// ═══════════════════════════════════════════════════════════════
// Categories CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Yeni kategori oluşturur.
 */
function addCategory(cat) {
  const stmt = db.prepare(
    'INSERT INTO categories (name, color, icon, sort_order) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(
    cat.name,
    cat.color || '#6366f1',
    cat.icon || '📁',
    cat.sort_order || 0
  );
  return getCategoryById(result.lastInsertRowid);
}

/**
 * Kategoriyi günceller.
 */
function updateCategory(cat) {
  const stmt = db.prepare(
    'UPDATE categories SET name = ?, color = ?, icon = ?, sort_order = ? WHERE id = ?'
  );
  stmt.run(
    cat.name,
    cat.color || '#6366f1',
    cat.icon || '📁',
    cat.sort_order || 0,
    cat.id
  );
  return getCategoryById(cat.id);
}

/**
 * Tek bir kategoriyi id ile getirir.
 */
function getCategoryById(id) {
  const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
  return stmt.get(id) || null;
}

/**
 * Tüm kategorileri getirir.
 */
function getCategories() {
  const stmt = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC');
  return stmt.all();
}

/**
 * Kategoriyi siler.
 */
function deleteCategory(id) {
  const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ═══════════════════════════════════════════════════════════════
// Settings CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Tek bir ayarı getirir.
 */
function getSetting(key) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get(key);
  return row ? row.value : (DEFAULT_SETTINGS[key] || null);
}

/**
 * Ayar kaydeder/günceller.
 */
function saveSetting(key, value) {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  );
  stmt.run(key, String(value));
  return { key, value: String(value) };
}

/**
 * Tüm ayarları getirir.
 */
function getAllSettings() {
  const stmt = db.prepare('SELECT * FROM settings');
  const rows = stmt.all();
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// ═══════════════════════════════════════════════════════════════
// İstatistikler
// ═══════════════════════════════════════════════════════════════

/**
 * Uygulama istatistiklerini getirir.
 */
function getStats() {
  const clipTotal = db.prepare('SELECT COUNT(*) as count FROM clipboard_history').get().count;
  const clipText = db.prepare("SELECT COUNT(*) as count FROM clipboard_history WHERE content_type = 'text'").get().count;
  const clipHtml = db.prepare("SELECT COUNT(*) as count FROM clipboard_history WHERE content_type = 'html'").get().count;
  const clipImage = db.prepare("SELECT COUNT(*) as count FROM clipboard_history WHERE content_type = 'image'").get().count;
  const clipPinned = db.prepare('SELECT COUNT(*) as count FROM clipboard_history WHERE is_pinned = 1').get().count;
  const clipFavorite = db.prepare('SELECT COUNT(*) as count FROM clipboard_history WHERE is_favorite = 1').get().count;
  const notesTotal = db.prepare('SELECT COUNT(*) as count FROM notes').get().count;
  const categoriesTotal = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;

  // Veritabanı boyutu
  let dbSize = 0;
  try {
    if (dbPath && fs.existsSync(dbPath)) {
      const stat = fs.statSync(dbPath);
      dbSize = stat.size;
    }
  } catch (err) {
    // Boyut alınamazsa 0 kal
  }

  // Bugün eklenen öğeler
  const todayCount = db.prepare(
    "SELECT COUNT(*) as count FROM clipboard_history WHERE date(created_at) = date('now','localtime')"
  ).get().count;

  return {
    clipboard: {
      total: clipTotal,
      text: clipText,
      html: clipHtml,
      image: clipImage,
      pinned: clipPinned,
      favorite: clipFavorite,
      today: todayCount,
    },
    notes: {
      total: notesTotal,
    },
    categories: {
      total: categoriesTotal,
    },
    database: {
      path: dbPath,
      size: dbSize,
      sizeFormatted: formatBytes(dbSize),
    },
  };
}

/**
 * Byte değerini okunabilir formata çevirir.
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ═══════════════════════════════════════════════════════════════
// Import / Export
// ═══════════════════════════════════════════════════════════════

/**
 * Tüm veriyi JSON objesi olarak dışa aktarır.
 */
function exportAll() {
  const clipboard_history = db.prepare('SELECT * FROM clipboard_history').all();
  const notes = db.prepare('SELECT * FROM notes').all();
  const categories = db.prepare('SELECT * FROM categories').all();
  const settings = db.prepare('SELECT * FROM settings').all();

  // Görselleri base64 olarak dahil et
  for (const item of clipboard_history) {
    if (item.image_path && fs.existsSync(item.image_path)) {
      try {
        const imageBuffer = fs.readFileSync(item.image_path);
        item.image_data = imageBuffer.toString('base64');
      } catch (err) {
        console.error('Görsel base64 dönüşüm hatası:', err);
      }
    }
  }

  return {
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    data: {
      clipboard_history,
      notes,
      categories,
      settings,
    },
  };
}

/**
 * JSON verisini veritabanına aktarır.
 * Mevcut veriyi temizlemeden ekler. Çakışmalarda mevcut kayıtlar korunur.
 * @param {Object} data - exportAll() formatında veri
 * @returns {Object} İçe aktarma sonuçları
 */
function importAll(data) {
  if (!data || !data.data) {
    throw new Error('Geçersiz içe aktarma verisi');
  }

  const results = {
    clipboard_history: 0,
    notes: 0,
    categories: 0,
    settings: 0,
  };

  const importTransaction = db.transaction(() => {
    // 1. Mevcut kategorileri çekerek ad -> yeni_id haritası oluşturalım
    const existingCats = db.prepare('SELECT id, name FROM categories').all();
    const catNameToNewId = {};
    for (const cat of existingCats) {
      catNameToNewId[cat.name] = cat.id;
    }

    const categoryIdMap = {}; // eski_id -> yeni_id haritası

    // Kategorileri içe aktar
    if (Array.isArray(data.data.categories)) {
      const catStmt = db.prepare(
        'INSERT INTO categories (name, color, icon, sort_order) VALUES (?, ?, ?, ?)'
      );
      const selectCatId = db.prepare('SELECT id FROM categories WHERE name = ?');

      for (const cat of data.data.categories) {
        let newId;
        if (catNameToNewId[cat.name]) {
          newId = catNameToNewId[cat.name];
        } else {
          try {
            const r = catStmt.run(cat.name, cat.color, cat.icon, cat.sort_order || 0);
            newId = r.lastInsertRowid;
            catNameToNewId[cat.name] = newId;
            results.categories++;
          } catch (e) {
            const row = selectCatId.get(cat.name);
            newId = row ? row.id : null;
          }
        }
        if (cat.id && newId) {
          categoryIdMap[cat.id] = newId;
        }
      }
    }

    // Clipboard geçmişini içe aktar
    if (Array.isArray(data.data.clipboard_history)) {
      const clipStmt = db.prepare(`
        INSERT INTO clipboard_history (content, content_type, preview, image_path, is_pinned, is_favorite, is_sensitive, source_app, created_at, char_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of data.data.clipboard_history) {
        let imagePath = item.image_path || null;

        // Base64 görsel verisi varsa dosyaya yaz
        if (item.image_data) {
          try {
            const imagesDir = path.join(path.dirname(dbPath), 'images');
            if (!fs.existsSync(imagesDir)) {
              fs.mkdirSync(imagesDir, { recursive: true });
            }
            const filename = `imported_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.png`;
            const imageFilePath = path.join(imagesDir, filename);
            const imageBuffer = Buffer.from(item.image_data, 'base64');
            fs.writeFileSync(imageFilePath, imageBuffer);
            imagePath = imageFilePath;
          } catch (imgErr) {
            console.error('Görsel import hatası:', imgErr);
          }
        }

        clipStmt.run(
          item.content,
          item.content_type || 'text',
          item.preview || '',
          imagePath,
          item.is_pinned || 0,
          item.is_favorite || 0,
          item.is_sensitive || 0,
          item.source_app || null,
          item.created_at || new Date().toISOString(),
          item.char_count || 0
        );
        results.clipboard_history++;
      }
    }

    // Notları içe aktar
    if (Array.isArray(data.data.notes)) {
      const noteStmt = db.prepare(`
        INSERT INTO notes (title, content, category_id, color, is_pinned, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const note of data.data.notes) {
        const newCategoryId = note.category_id && categoryIdMap[note.category_id]
          ? categoryIdMap[note.category_id]
          : null;

        noteStmt.run(
          note.title,
          note.content,
          newCategoryId,
          note.color || '#3b82f6',
          note.is_pinned || 0,
          note.created_at || new Date().toISOString(),
          note.updated_at || new Date().toISOString()
        );
        results.notes++;
      }
    }

    // Ayarları içe aktar (veri konumu yerel kalmalı)
    if (Array.isArray(data.data.settings)) {
      const settingStmt = db.prepare(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
      );
      for (const s of data.data.settings) {
        if (s.key === 'dataLocation') continue;
        settingStmt.run(s.key, s.value);
        results.settings++;
      }
    }
  });

  importTransaction();
  return results;
}

// ═══════════════════════════════════════════════════════════════
// Veritabanı Konumu Değiştirme
// ═══════════════════════════════════════════════════════════════

/**
 * Veritabanı konumunu değiştirir.
 * Mevcut veritabanını yeni konuma kopyalar ve yeniden açar.
 * @param {string} newLocation - Yeni klasör yolu
 * @param {string} userDataPath - Fallback userData yolu
 * @returns {boolean}
 */
function changeLocation(newLocation, userDataPath) {
  const oldPath = dbPath;
  const newPath = path.join(newLocation, 'clipboard-pro.db');

  // Aynı konumsa işlem yapma
  if (oldPath === newPath) return true;

  const oldLocation = oldPath ? path.dirname(oldPath) : userDataPath;
  const oldImagesDir = path.join(oldLocation, 'images');
  const newImagesDir = path.join(newLocation, 'images');

  try {
    // Yeni klasörleri oluştur
    if (!fs.existsSync(newLocation)) {
      fs.mkdirSync(newLocation, { recursive: true });
    }

    // Mevcut DB'yi kapat
    if (db) {
      db.close();
      db = null;
    }

    // Dosyayı kopyala (varsa)
    if (oldPath && fs.existsSync(oldPath)) {
      fs.copyFileSync(oldPath, newPath);

      // WAL ve SHM dosyalarını da kopyala
      const walPath = oldPath + '-wal';
      const shmPath = oldPath + '-shm';
      if (fs.existsSync(walPath)) {
        try { fs.copyFileSync(walPath, newPath + '-wal'); } catch (e) {}
      }
      if (fs.existsSync(shmPath)) {
        try { fs.copyFileSync(shmPath, newPath + '-shm'); } catch (e) {}
      }
    }

    // Görsel dosyalarını kopyala
    if (fs.existsSync(oldImagesDir)) {
      if (!fs.existsSync(newImagesDir)) {
        fs.mkdirSync(newImagesDir, { recursive: true });
      }
      const files = fs.readdirSync(oldImagesDir);
      for (const file of files) {
        const oldFilePath = path.join(oldImagesDir, file);
        const newFilePath = path.join(newImagesDir, file);
        try {
          fs.copyFileSync(oldFilePath, newFilePath);
        } catch (e) {
          console.error(`Görsel kopyalanamadı: ${file}`, e);
        }
      }
    }

    // Yeni konumda aç
    initialize(newLocation);

    // Veritabanındaki görsel yollarını yeni konuma göre güncelle
    if (fs.existsSync(newImagesDir)) {
      const oldImagesPathNormalized = oldImagesDir.replace(/\\/g, '/');
      const newImagesPathNormalized = newImagesDir.replace(/\\/g, '/');

      db.prepare(`
        UPDATE clipboard_history 
        SET image_path = replace(replace(image_path, ?, ?), ?, ?)
        WHERE image_path IS NOT NULL
      `).run(
        oldImagesDir, newImagesDir,
        oldImagesPathNormalized, newImagesPathNormalized
      );
    }

    // Ayarı kaydet
    saveSetting('dataLocation', newLocation);

    // Eski veritabanı dosyalarını ve eski görselleri güvenle sil
    if (oldPath && fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
        const walPath = oldPath + '-wal';
        const shmPath = oldPath + '-shm';
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      } catch (e) {
        console.warn('Eski veritabanı dosyaları silinemedi:', e);
      }
    }

    if (fs.existsSync(oldImagesDir)) {
      try {
        const files = fs.readdirSync(oldImagesDir);
        for (const file of files) {
          fs.unlinkSync(path.join(oldImagesDir, file));
        }
        fs.rmdirSync(oldImagesDir);
      } catch (e) {
        console.warn('Eski images klasörü temizlenemedi:', e);
      }
    }

    return true;
  } catch (err) {
    console.error('Veritabanı taşıma hatası:', err);
    // Hata durumunda eski konumda aç
    try {
      initialize(userDataPath);
    } catch (fallbackErr) {
      console.error('Fallback açma hatası:', fallbackErr);
    }
    throw err;
  }
}

/**
 * Mevcut veritabanı yolunu döner.
 */
function getDbPath() {
  return dbPath;
}

// ═══════════════════════════════════════════════════════════════
// Module Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Başlatma & Bağlantı
  initialize,
  close,
  isReady,
  getDbPath,
  changeLocation,

  // Clipboard
  addClipboardItem,
  getClipboardItemById,
  getClipboardHistory,
  deleteClipboardItem,
  clearHistory,
  togglePin,
  toggleFavorite,

  // Notes
  addNote,
  updateNote,
  getNoteById,
  getNotes,
  deleteNote,
  reorderNotes,

  // Categories
  addCategory,
  updateCategory,
  getCategoryById,
  getCategories,
  deleteCategory,

  // Settings
  getSetting,
  saveSetting,
  getAllSettings,

  // Stats
  getStats,

  // Import / Export
  exportAll,
  importAll,
};
