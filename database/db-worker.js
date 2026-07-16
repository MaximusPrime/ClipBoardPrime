/**
 * ClipBoardPrime — Database Worker Thread
 * =======================================
 * SQLite işlemlerini ayrı bir thread üzerinde senkron olarak yürütür,
 * ana thread'i bloke etmez.
 */

const { parentPort, workerData } = require('worker_threads');
const db = require('./db');

try {
  // Veritabanını başlat
  db.initialize(workerData.userDataPath, workerData.customLocation || '');
  parentPort.postMessage({ status: 'ready' });
} catch (err) {
  parentPort.postMessage({ status: 'error', error: err.message });
  process.exit(1);
}

// Main thread'den gelen sorgu ve komutları dinle
parentPort.on('message', (message) => {
  const { id, action, params } = message;

  try {
    let result;

    switch (action) {
      // ── Clipboard ──────────────────────────────────────────────
      case 'getClipboardHistory':
        result = db.getClipboardHistory(params);
        break;
      case 'getClipboardItemById':
        result = db.getClipboardItemById(params);
        break;

      case 'addClipboardItem':
        result = db.addClipboardItem(params);
        break;
      case 'deleteClipboardItem':
        result = db.deleteClipboardItem(params);
        break;
      case 'clearHistory':
        result = db.clearHistory();
        break;
      case 'togglePin':
        result = db.togglePin(params);
        break;
      case 'toggleFavorite':
        result = db.toggleFavorite(params);
        break;

      // ── Notes ──────────────────────────────────────────────────
      case 'getNotes':
        result = db.getNotes(params);
        break;
      case 'addNote':
        result = db.addNote(params);
        break;
      case 'updateNote':
        result = db.updateNote(params);
        break;
      case 'deleteNote':
        result = db.deleteNote(params);
        break;
      case 'reorderNotes':
        result = db.reorderNotes(params);
        break;

      // ── Categories ─────────────────────────────────────────────
      case 'getCategories':
        result = db.getCategories();
        break;
      case 'addCategory':
        result = db.addCategory(params);
        break;
      case 'updateCategory':
        result = db.updateCategory(params);
        break;
      case 'deleteCategory':
        result = db.deleteCategory(params);
        break;

      // ── Settings ───────────────────────────────────────────────
      case 'getSetting':
        result = db.getSetting(params);
        break;
      case 'saveSetting':
        result = db.saveSetting(params.key, params.value);
        break;
      case 'getAllSettings':
        result = db.getAllSettings();
        break;

      // ── Stats & Maintenance ─────────────────────────────────────
      case 'getStats':
        result = db.getStats();
        break;
      case 'exportAll':
        result = db.exportAll();
        break;
      case 'importAll':
        result = db.importAll(params);
        break;
      case 'changeLocation':
        result = db.changeLocation(params.newLocation, params.userDataPath);
        break;
      case 'cleanupOrphanImages':
        db.cleanupOrphanImages();
        result = true;
        break;

      default:
        throw new Error(`Bilinmeyen veritabanı eylemi: ${action}`);
    }

    parentPort.postMessage({ id, success: true, data: result });
  } catch (err) {
    console.error(`Worker veritabanı hatası (${action}):`, err);
    parentPort.postMessage({ id, success: false, error: err.message });
  }
});
