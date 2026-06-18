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

// Şifreleme / Çözme placeholders (Main process'ten enjekte edilir)
let encryptFn = (text) => text;
let decryptFn = (text) => text;

// Şifreleme seçeneklerini sakla — changeLocation sonrası initialize'de tekrar kullanılır
let currentDbOptions = {};

// ─── Prepared Statement Cache ────────────────────────────────
// addClipboardItem'da her çağrıda db.prepare() yapmak yerine önbelleğe alıyoruz.
// DB yeniden açıldığında (changeLocation) null'a sıfırlanır ve otomatik yenilenir.
let _stmtInsertClip = null;
let _stmtCheckClipText = null;
let _stmtCheckClipImage = null;
let _stmtUpdateClipTime = null;
let _stmtGetClipById = null;

function _invalidateStatements() {
  _stmtInsertClip = null;
  _stmtCheckClipText = null;
  _stmtCheckClipImage = null;
  _stmtUpdateClipTime = null;
  _stmtGetClipById = null;
}

// ─── Varsayılan Ayarlar ──────────────────────────────────────
const DEFAULT_SETTINGS = {
  theme: 'dark',
  maxHistory: '0',
  pollingInterval: '500',
  startWithWindows: 'true',
  dataLocation: '',
  globalShortcut: 'Ctrl+Shift+V',
  showPreview: 'true',
  detectSensitive: 'true',
  blurToTray: 'true',
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
 * @param {Object} [options] - Şifreleme/çözme fonksiyonları { encrypt, decrypt }
 */
function initialize(userDataPath, customLocation, options = {}) {
  // Seçenekleri sakla — changeLocation sonraki initialize çağrısı için kullanır
  if (options && typeof options.encrypt === 'function') {
    encryptFn = options.encrypt;
    currentDbOptions = options;
  }
  if (options && typeof options.decrypt === 'function') {
    decryptFn = options.decrypt;
  }
  // Prepared statement cache'i temizle (yeni DB bağlantısı için)
  _invalidateStatements();
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

    // Migrasyon: Notes is_favorite
    migrateNoteIsFavorite();

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
      is_favorite INTEGER DEFAULT 0,
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
 * Notes tablosuna is_favorite kolonu ekler (migration).
 */
function migrateNoteIsFavorite() {
  try {
    const columns = db.pragma('table_info(notes)');
    const hasIsFavorite = columns.some(c => c.name === 'is_favorite');
    if (!hasIsFavorite) {
      db.exec('ALTER TABLE notes ADD COLUMN is_favorite INTEGER DEFAULT 0');
      db.exec('CREATE INDEX IF NOT EXISTS idx_notes_is_favorite ON notes(is_favorite)');
    }
  } catch (err) {
    console.error('Notes is_favorite migration hatası:', err);
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
  // Nesneyi klonlayıp şifreleme uygulayalım
  const dbItem = { ...item };
  if (dbItem.is_sensitive && dbItem.content_type !== 'image' && dbItem.content) {
    // Deterministik şifreleme yap ki mükerrerlik tespiti doğru çalışsın
    dbItem.content = encryptFn(dbItem.content, true);
    if (dbItem.preview) {
      dbItem.preview = encryptFn(dbItem.preview, true);
    }
  }

  // Mükerrerlik Kontrolü — önbelleklenmiş prepared statements kullan
  if (!_stmtCheckClipImage) {
    _stmtCheckClipImage = db.prepare('SELECT id FROM clipboard_history WHERE image_path = ?');
  }
  if (!_stmtCheckClipText) {
    _stmtCheckClipText = db.prepare('SELECT id FROM clipboard_history WHERE content = ? AND content_type = ?');
  }
  if (!_stmtUpdateClipTime) {
    _stmtUpdateClipTime = db.prepare("UPDATE clipboard_history SET created_at = datetime('now','localtime') WHERE id = ?");
  }
  if (!_stmtGetClipById) {
    _stmtGetClipById = db.prepare('SELECT * FROM clipboard_history WHERE id = ?');
  }

  let existing = null;
  if (dbItem.content_type === 'image') {
    if (dbItem.image_path) {
      existing = _stmtCheckClipImage.get(dbItem.image_path);
    }
  } else {
    existing = _stmtCheckClipText.get(
      dbItem.content,
      dbItem.content_type || 'text'
    );
  }

  if (existing) {
    _stmtUpdateClipTime.run(existing.id);
    return getClipboardItemById(existing.id);
  }

  if (!_stmtInsertClip) {
    _stmtInsertClip = db.prepare(`
      INSERT INTO clipboard_history (content, content_type, preview, image_path, is_sensitive, source_app, char_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
  }
  const stmt = _stmtInsertClip;

  let preview = dbItem.preview || (
    dbItem.content_type === 'text'
      ? dbItem.content.substring(0, 200)
      : dbItem.content_type === 'html'
        ? dbItem.content.replace(/<[^>]*>/g, '').substring(0, 200)
        : ''
  );

  // Eğer preview otomatik oluşturulduysa ve veri hassassa o da şifrelenmeli
  if (dbItem.is_sensitive && dbItem.content_type !== 'image' && !dbItem.preview) {
    const plainPreview = item.content_type === 'text'
      ? item.content.substring(0, 200)
      : item.content_type === 'html'
        ? item.content.replace(/<[^>]*>/g, '').substring(0, 200)
        : '';
    preview = encryptFn(plainPreview, true);
  }

  const result = stmt.run(
    dbItem.content,
    dbItem.content_type || 'text',
    preview,
    dbItem.image_path || null,
    dbItem.is_sensitive || 0,
    dbItem.source_app || null,
    dbItem.char_count || (item.content ? item.content.length : 0)
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
  const item = stmt.get(id) || null;
  
  if (item && item.is_sensitive && item.content_type !== 'image') {
    item.content = decryptFn(item.content);
    if (item.preview) {
      item.preview = decryptFn(item.preview);
    }
  }
  return item;
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

  // Hassas verileri çözmeyelim, renderer'a göndermemek için content'i null yapıp preview'u maskeleyelim
  items.forEach(item => {
    if (item.is_sensitive && item.content_type !== 'image') {
      item.content = null;
      item.preview = '•••••••••••• (Hassas Veri)';
    }
  });

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

  if (params.pinned !== undefined && params.pinned !== null) {
    whereClauses.push('n.is_pinned = ?');
    queryParams.push(params.pinned ? 1 : 0);
  }

  if (params.favorite !== undefined && params.favorite !== null) {
    whereClauses.push('n.is_favorite = ?');
    queryParams.push(params.favorite ? 1 : 0);
  }

  const whereSQL = whereClauses.length > 0
    ? 'WHERE ' + whereClauses.join(' AND ')
    : '';

  const hasCategory = params.category_id !== undefined && params.category_id !== null;
  const hasPinned = params.pinned !== undefined && params.pinned !== null;
  const hasFavorite = params.favorite !== undefined && params.favorite !== null;
  const isAllView = !hasCategory && !hasPinned && !hasFavorite;
  const orderClause = isAllView ? 'ORDER BY n.updated_at DESC' : 'ORDER BY n.sort_order ASC, n.updated_at DESC';

  const stmt = db.prepare(`
    SELECT n.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM notes n
    LEFT JOIN categories c ON n.category_id = c.id
    ${whereSQL}
    ${orderClause}
  `);

  return stmt.all(...queryParams);
}

/**
 * Notun favori durumunu değiştirir.
 */
function toggleFavoriteNote(id) {
  const stmt = db.prepare(
    'UPDATE notes SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?'
  );
  stmt.run(id);
  return getNoteById(id);
}

/**
 * Notun pin durumunu değiştirir.
 */
function togglePinNote(id) {
  const stmt = db.prepare(
    'UPDATE notes SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END WHERE id = ?'
  );
  stmt.run(id);
  return getNoteById(id);
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

/**
 * Notun güncelleme tarihini doğrudan değiştirir.
 */
function updateNoteDate(id, newDateStr) {
  const stmt = db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?');
  const result = stmt.run(newDateStr, id);
  return result.changes > 0;
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
  const transaction = db.transaction((catId) => {
    return stmt.run(catId).changes > 0;
  });
  return transaction(id);
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
  // Tüm COUNT sorguları tek transaction içinde — tutarlı anlık görünüm + performans
  const statsTransaction = db.transaction(() => {
    const row = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN content_type = 'text'  THEN 1 ELSE 0 END) AS text,
        SUM(CASE WHEN content_type = 'html'  THEN 1 ELSE 0 END) AS html,
        SUM(CASE WHEN content_type = 'image' THEN 1 ELSE 0 END) AS image,
        SUM(CASE WHEN is_pinned = 1          THEN 1 ELSE 0 END) AS pinned,
        SUM(CASE WHEN is_favorite = 1        THEN 1 ELSE 0 END) AS favorite,
        SUM(CASE WHEN date(created_at) = date('now','localtime') THEN 1 ELSE 0 END) AS today
      FROM clipboard_history
    `).get();

    const notesTotal      = db.prepare('SELECT COUNT(*) as count FROM notes').get().count;
    const categoriesTotal = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;

    return { clip: row, notesTotal, categoriesTotal };
  });

  const { clip, notesTotal, categoriesTotal } = statsTransaction();

  // Veritabanı boyutu (transaction dışı — dosya sistemi işlemi)
  let dbSize = 0;
  try {
    if (dbPath && fs.existsSync(dbPath)) {
      dbSize = fs.statSync(dbPath).size;
    }
  } catch (err) {
    // Boyut alınamazsa 0 kal
  }

  return {
    clipboard: {
      total:    clip.total    || 0,
      text:     clip.text     || 0,
      html:     clip.html     || 0,
      image:    clip.image    || 0,
      pinned:   clip.pinned   || 0,
      favorite: clip.favorite || 0,
      today:    clip.today    || 0,
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
 * Şifreli hassas verileri yedekleme işlemi için düz metne çözer.
 */
function decryptSensitiveItem(item) {
  if (item && item.is_sensitive && item.content_type !== 'image') {
    const dbItem = { ...item };
    dbItem.content = decryptFn(dbItem.content);
    if (dbItem.preview) {
      dbItem.preview = decryptFn(dbItem.preview);
    }
    return dbItem;
  }
  return item;
}

/**
 * Tüm veriyi JSON objesi olarak dışa aktarır.
 */
function exportAll() {
  const clipboard_history = db.prepare('SELECT * FROM clipboard_history').all().map(decryptSensitiveItem);
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
 * İçe aktarma verisinin şemasını doğrular.
 * @param {Object} data - İçe aktarılacak JSON verisi
 */
function validateImportData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('İçe aktarma verisi bir nesne (object) olmalıdır.');
  }
  if (!data.version || typeof data.version !== 'string') {
    throw new Error('İçe aktarma verisi geçerli bir "version" dizesi içermelidir.');
  }
  if (!data.data || typeof data.data !== 'object') {
    throw new Error('İçe aktarma verisi geçerli bir "data" nesnesi içermelidir.');
  }

  const payload = data.data;

  // 1. categories doğrulaması
  if (payload.categories !== undefined) {
    if (!Array.isArray(payload.categories)) {
      throw new Error('Yedek dosyasındaki "categories" bir dizi (array) olmalıdır.');
    }
    for (let i = 0; i < payload.categories.length; i++) {
      const cat = payload.categories[i];
      if (typeof cat !== 'object' || cat === null) {
        throw new Error(`Kategoriler dizisindeki ${i}. eleman geçersiz bir nesnedir.`);
      }
      if (typeof cat.name !== 'string' || cat.name.trim() === '') {
        throw new Error(`Kategoriler dizisindeki ${i}. elemanın "name" alanı zorunlu ve metin (string) olmalıdır.`);
      }
      if (cat.color !== undefined && typeof cat.color !== 'string') {
        throw new Error(`Kategoriler dizisindeki "${cat.name}" elemanının "color" değeri metin (string) olmalıdır.`);
      }
      if (cat.icon !== undefined && typeof cat.icon !== 'string') {
        throw new Error(`Kategoriler dizisindeki "${cat.name}" elemanının "icon" değeri metin (string) olmalıdır.`);
      }
    }
  }

  // 2. clipboard_history doğrulaması
  if (payload.clipboard_history !== undefined) {
    if (!Array.isArray(payload.clipboard_history)) {
      throw new Error('Yedek dosyasındaki "clipboard_history" bir dizi (array) olmalıdır.');
    }
    for (let i = 0; i < payload.clipboard_history.length; i++) {
      const item = payload.clipboard_history[i];
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Pano geçmişi dizisindeki ${i}. eleman geçersiz bir nesnedir.`);
      }
      if (typeof item.content !== 'string') {
        throw new Error(`Pano geçmişi dizisindeki ${i}. elemanın "content" alanı zorunlu ve metin (string) olmalıdır.`);
      }
      if (item.content_type !== undefined && typeof item.content_type !== 'string') {
        throw new Error(`Pano geçmişi dizisindeki ${i}. elemanın "content_type" değeri metin (string) olmalıdır.`);
      }
      if (item.is_pinned !== undefined && typeof item.is_pinned !== 'number') {
        throw new Error(`Pano geçmişi dizisindeki ${i}. elemanın "is_pinned" değeri sayı (number: 0 veya 1) olmalıdır.`);
      }
      if (item.is_favorite !== undefined && typeof item.is_favorite !== 'number') {
        throw new Error(`Pano geçmişi dizisindeki ${i}. elemanın "is_favorite" değeri sayı (number: 0 veya 1) olmalıdır.`);
      }
    }
  }

  // 3. notes doğrulaması
  if (payload.notes !== undefined) {
    if (!Array.isArray(payload.notes)) {
      throw new Error('Yedek dosyasındaki "notes" bir dizi (array) olmalıdır.');
    }
    for (let i = 0; i < payload.notes.length; i++) {
      const note = payload.notes[i];
      if (typeof note !== 'object' || note === null) {
        throw new Error(`Notlar dizisindeki ${i}. eleman geçersiz bir nesnedir.`);
      }
      if (typeof note.title !== 'string') {
        throw new Error(`Notlar dizisindeki ${i}. elemanın "title" alanı zorunlu ve metin (string) olmalıdır.`);
      }
      if (typeof note.content !== 'string') {
        throw new Error(`Notlar dizisindeki ${i}. elemanın "content" alanı zorunlu ve metin (string) olmalıdır.`);
      }
      if (note.color !== undefined && typeof note.color !== 'string') {
        throw new Error(`Notlar dizisindeki "${note.title}" elemanının "color" değeri metin (string) olmalıdır.`);
      }
    }
  }

  // 4. settings doğrulaması
  if (payload.settings !== undefined) {
    if (!Array.isArray(payload.settings)) {
      throw new Error('Yedek dosyasındaki "settings" bir dizi (array) olmalıdır.');
    }
    for (let i = 0; i < payload.settings.length; i++) {
      const s = payload.settings[i];
      if (typeof s !== 'object' || s === null) {
        throw new Error(`Ayarlar dizisindeki ${i}. eleman geçersiz bir nesnedir.`);
      }
      if (typeof s.key !== 'string' || s.key.trim() === '') {
        throw new Error(`Ayarlar dizisindeki ${i}. elemanın "key" alanı zorunlu ve metin (string) olmalıdır.`);
      }
      if (s.value === undefined) {
        throw new Error(`Ayarlar dizisindeki "${s.key}" elemanının "value" alanı zorunludur.`);
      }
    }
  }
}

/**
 * İçe aktarma sırasında mükerrer pano öğesi kontrolü yapar.
 */
function checkExistingClipboardItem(content, contentType, isSensitive) {
  let queryContent = content;
  if (isSensitive && contentType !== 'image' && content) {
    queryContent = encryptFn(content, true);
  }
  const stmt = db.prepare('SELECT id FROM clipboard_history WHERE content = ? AND content_type = ?');
  return stmt.get(queryContent, contentType) || null;
}

/**
 * İçe aktarma sırasında hassas verileri şifreler.
 */
function encryptSensitiveContent(content, isSensitive) {
  if (isSensitive && content) {
    return encryptFn(content, true);
  }
  return content;
}

/**
 * JSON verisini veritabanına aktarır.
 * Mevcut veriyi temizlemeden ekler. Çakışmalarda mevcut kayıtlar korunur.
 * @param {Object} data - exportAll() formatında veri
 * @returns {Object} İçe aktarma sonuçları
 */
function importAll(data) {
  // JSON Şema Doğrulaması
  validateImportData(data);

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
        // Mükerrer kontrolü
        const existing = checkExistingClipboardItem(item.content, item.content_type || 'text', item.is_sensitive);
        if (existing) continue;

        let imagePath = null;

        // Base64 görsel verisi varsa dosyaya yaz
        if (item.content_type === 'image') {
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
        } else {
          imagePath = item.image_path || null;
        }

        // Encrypt the sensitive content on import
        const encryptedContent = encryptSensitiveContent(item.content, item.is_sensitive);

        // Mask/encrypt preview if sensitive
        let preview = item.preview || '';
        if (item.is_sensitive && item.content_type !== 'image') {
          preview = encryptFn(preview || '•••••••••••• (Hassas Veri)', true);
        }

        clipStmt.run(
          encryptedContent,
          item.content_type || 'text',
          preview,
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
      const checkNote = db.prepare('SELECT id FROM notes WHERE title = ? AND content = ? AND created_at = ?');

      for (const note of data.data.notes) {
        // Mükerrer kontrolü
        const existing = checkNote.get(note.title, note.content, note.created_at || '');
        if (existing) continue;

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

  // İçe aktarma sonrasında yetim görselleri diskten temizle
  cleanupOrphanImages();

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
/**
 * Bir dosyayı kilitlenme veya meşguliyet durumlarına karşı yeniden deneme mekanizması ile kopyalar.
 */
function copyFileWithRetry(src, dest, maxRetries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      fs.copyFileSync(src, dest);
      return true;
    } catch (err) {
      lastErr = err;
      // Busy-wait yerine sadece yeniden dene — senkron ortamda sleep mümkün değil
      // Kısa bir dosya kopyasında WAL checkpoint sonrası kilit genellikle hemen kalkar
    }
  }
  throw lastErr;
}

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

  // Aynı konumsa işlem yapma (Windows için büyük/küçük harf duyarsız)
  if (oldPath && newPath && path.normalize(oldPath).toLowerCase() === path.normalize(newPath).toLowerCase()) {
    return true;
  }

  const oldLocation = oldPath ? path.dirname(oldPath) : userDataPath;
  const oldImagesDir = path.join(oldLocation, 'images');
  const newImagesDir = path.join(newLocation, 'images');

  // Disk yazma yetkisi ve boş alan kontrolü
  try {
    if (!fs.existsSync(newLocation)) {
      fs.mkdirSync(newLocation, { recursive: true });
    }
    
    // Disk boş alan kontrolü
    const stats = fs.statfsSync(newLocation);
    // stats.bavail * stats.bsize = kullanılabilir boş alan (byte cinsinden)
    const freeSpace = stats.bavail * stats.bsize;

    // Kopyalanacak dosyaların toplam boyutunu hesapla
    let requiredSpace = 0;
    if (oldPath && fs.existsSync(oldPath)) {
      requiredSpace += fs.statSync(oldPath).size;
      const walPath = oldPath + '-wal';
      const shmPath = oldPath + '-shm';
      if (fs.existsSync(walPath)) requiredSpace += fs.statSync(walPath).size;
      if (fs.existsSync(shmPath)) requiredSpace += fs.statSync(shmPath).size;
    }
    if (fs.existsSync(oldImagesDir)) {
      const files = fs.readdirSync(oldImagesDir);
      for (const file of files) {
        requiredSpace += fs.statSync(path.join(oldImagesDir, file)).size;
      }
    }

    if (freeSpace < requiredSpace) {
      throw new Error('Hedef sürücüde yeterli disk alanı yok!');
    }

    // Yazma yetkisi testi
    const testFilePath = path.join(newLocation, '.write_test_' + Date.now());
    fs.writeFileSync(testFilePath, 'test');
    fs.unlinkSync(testFilePath);
  } catch (writeErr) {
    console.error('Yeni veri konumuna yazma yetkisi veya disk alanı hatası:', writeErr);
    throw new Error(writeErr.message.includes('disk alanı') 
      ? 'Hedef sürücüde yeterli disk alanı yok!' 
      : 'Seçilen klasöre yazma yetkiniz bulunmuyor. Lütfen başka bir klasör seçin.');
  }

  // Kopyalanan dosyaları takip et (hata durumunda güvenli rollback temizliği için)
  const copiedFiles = [];

  try {
    // Mevcut DB'yi kapatmadan önce WAL verisini checkpoint ile ana dosyaya yaz
    if (db) {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch (checkpointErr) {
        console.warn('Veritabanı checkpoint başarısız (kapatma işlemine devam ediliyor):', checkpointErr);
      }
      db.close();
      db = null;
      _invalidateStatements();
    }

    // Dosyayı kopyala (varsa)
    if (oldPath && fs.existsSync(oldPath)) {
      copyFileWithRetry(oldPath, newPath);
      copiedFiles.push(newPath);

      // WAL ve SHM dosyalarını da kopyala
      const walPath = oldPath + '-wal';
      const shmPath = oldPath + '-shm';
      if (fs.existsSync(walPath)) {
        try {
          copyFileWithRetry(walPath, newPath + '-wal', 2, 100);
          copiedFiles.push(newPath + '-wal');
        } catch (e) {
          console.warn('WAL kopyalanamadı (yoksayılıyor):', e);
        }
      }
      if (fs.existsSync(shmPath)) {
        try {
          copyFileWithRetry(shmPath, newPath + '-shm', 2, 100);
          copiedFiles.push(newPath + '-shm');
        } catch (e) {
          console.warn('SHM kopyalanamadı (yoksayılıyor):', e);
        }
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
          copyFileWithRetry(oldFilePath, newFilePath);
          copiedFiles.push(newFilePath);
        } catch (e) {
          console.error(`Görsel kopyalanamadı: ${file}`, e);
          throw new Error(`Görsel dosyası kopyalanamadı (${file}): ${e.message}`);
        }
      }
    }

    // Yeni konumda aç — şifreleme seçeneklerini mutlaka geçir
    initialize(newLocation, '', currentDbOptions);

    // SQLite bütünlük kontrolü yap
    const checkResult = db.pragma('integrity_check');
    if (!checkResult || !checkResult[0] || checkResult[0].integrity_check !== 'ok') {
      throw new Error('Veritabanı bütünlük kontrolü başarısız oldu!');
    }

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
        if (fs.existsSync(walPath)) try { fs.unlinkSync(walPath); } catch (e) {}
        if (fs.existsSync(shmPath)) try { fs.unlinkSync(shmPath); } catch (e) {}
      } catch (e) {
        console.warn('Eski veritabanı dosyaları silinemedi:', e);
      }
    }

    if (fs.existsSync(oldImagesDir)) {
      try {
        const files = fs.readdirSync(oldImagesDir);
        for (const file of files) {
          try { fs.unlinkSync(path.join(oldImagesDir, file)); } catch (e) {}
        }
        try { fs.rmdirSync(oldImagesDir); } catch (e) {}
      } catch (e) {
        console.warn('Eski images klasörü temizlenemedi:', e);
      }
    }

    return true;
  } catch (err) {
    console.error('Veritabanı taşıma hatası:', err);
    
    // Hata durumunda yeni açılan kilitleri temizle ve yarıda kalmış yeni dosyaları sil
    try {
      if (db) {
        db.close();
        db = null;
      }
      
      // Sadece bu taşıma sırasında kopyalanan dosyaları diskten sil (Rollback)
      for (const file of copiedFiles) {
        if (fs.existsSync(file)) {
          try { fs.unlinkSync(file); } catch (e) {}
        }
      }
      
      // Eğer newImagesDir klasörü tarafımızdan oluşturulup içi boş kaldıysa kaldır
      if (fs.existsSync(newImagesDir)) {
        try {
          const files = fs.readdirSync(newImagesDir);
          if (files.length === 0) {
            fs.rmdirSync(newImagesDir);
          }
        } catch (e) {}
      }
    } catch (cleanupErr) {
      console.warn('Geri dönüş temizliği başarısız:', cleanupErr);
    }

    // Eski konumda tekrar aç ve yükle — şifreleme seçeneklerini koru
    try {
      const oldLocationCustom = oldLocation === userDataPath ? '' : oldLocation;
      initialize(userDataPath, oldLocationCustom, currentDbOptions);
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
  toggleFavoriteNote,
  togglePinNote,
  updateNoteDate,

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
  cleanupOrphanImages,
};

/**
 * Veritabanında kaydı bulunmayan yetim (orphan) görsel dosyalarını diskten siler.
 */
function cleanupOrphanImages() {
  try {
    if (!dbPath) return;
    const baseDir = path.dirname(dbPath);
    const imagesDir = path.join(baseDir, 'images');
    
    if (!fs.existsSync(imagesDir)) return;

    // 1. Veritabanındaki tüm geçerli görsel yollarını al ve normalize et
    const dbImages = db.prepare(
      "SELECT image_path FROM clipboard_history WHERE image_path IS NOT NULL"
    ).all();
    
    const dbPathsSet = new Set(
      dbImages.map(img => path.normalize(img.image_path).toLowerCase())
    );

    // 2. Klasördeki tüm dosyaları oku ve listede yoksa sil
    const files = fs.readdirSync(imagesDir);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(imagesDir, file);
      const normalizedFilePath = path.normalize(filePath).toLowerCase();
      
      if (!dbPathsSet.has(normalizedFilePath)) {
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (err) {
          console.error(`Yetim görsel silinemedi (${file}):`, err);
        }
      }
    }
    
    // Temizleme tamamlandı (debug log kaldırıldı — prod'da gereksiz)
  } catch (err) {
    console.error('Yetim görsel temizleme hatası:', err);
  }
}
