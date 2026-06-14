/**
 * ClipBoard Pro — Preload Script
 * ================================
 * contextBridge ile güvenli IPC köprüsü.
 * Renderer process'e sadece izin verilen kanalları açar.
 */

const { contextBridge, ipcRenderer } = require('electron');

// İzin verilen IPC kanalları (güvenlik için whitelist)
const ALLOWED_INVOKE_CHANNELS = [
  'get-clipboard-history',
  'delete-clipboard-item',
  'clear-clipboard-history',
  'toggle-pin-clipboard',
  'toggle-favorite-clipboard',
  'copy-to-clipboard',
  'clip-to-note',
  'get-notes',
  'save-note',
  'delete-note',
  'toggle-favorite-note',
  'toggle-pin-note',
  'update-note-date',
  'get-categories',
  'save-category',
  'delete-category',
  'get-settings',
  'save-setting',
  'select-data-location',
  'export-data',
  'import-data',
  'get-stats',
  'paste-to-active-window',
  'reorder-notes',
  'open-external',
  'get-app-info',
  'reveal-sensitive-content',
  'cleanup-orphan-images',
];

const ALLOWED_ON_CHANNELS = [
  'clipboard-changed',
  'settings-changed',
  'navigate',
];

/**
 * Güvenli invoke wrapper — sadece whitelist'teki kanallara izin verir.
 */
function safeInvoke(channel, ...args) {
  if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
    throw new Error(`IPC kanalı izin verilmedi: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

/**
 * Güvenli on wrapper — sadece whitelist'teki kanallara izin verir.
 * Cleanup fonksiyonu döner.
 */
function safeOn(channel, callback) {
  if (!ALLOWED_ON_CHANNELS.includes(channel)) {
    throw new Error(`IPC dinleme kanalı izin verilmedi: ${channel}`);
  }
  const wrappedCallback = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, wrappedCallback);

  // Cleanup fonksiyonu döndür
  return () => {
    ipcRenderer.removeListener(channel, wrappedCallback);
  };
}

// ─── API Exposure ──────────────────────────────────────────────
contextBridge.exposeInMainWorld('api', {
  getCachedSettings: () => ipcRenderer.sendSync('get-cached-settings'),

  // ── Clipboard ──────────────────────────────────────────────
  getClipboardHistory: (params) => safeInvoke('get-clipboard-history', params),
  deleteClipboardItem: (id) => safeInvoke('delete-clipboard-item', id),
  clearClipboardHistory: () => safeInvoke('clear-clipboard-history'),
  togglePinClipboard: (id) => safeInvoke('toggle-pin-clipboard', id),
  toggleFavoriteClipboard: (id) => safeInvoke('toggle-favorite-clipboard', id),
  copyToClipboard: (params, type, ignoreChange = true) => {
    if (params && typeof params === 'object') {
      return safeInvoke('copy-to-clipboard', params);
    }
    return safeInvoke('copy-to-clipboard', { content: params, type, ignoreChange });
  },
  clipToNote: (id) => safeInvoke('clip-to-note', id),
  pasteToActiveWindow: (params) => safeInvoke('paste-to-active-window', params),
  revealSensitiveContent: (id) => safeInvoke('reveal-sensitive-content', id),
  cleanupOrphanImages: () => safeInvoke('cleanup-orphan-images'),

  // ── Notes ──────────────────────────────────────────────────
  getNotes: (params) => safeInvoke('get-notes', params),
  saveNote: (note) => safeInvoke('save-note', note),
  deleteNote: (id) => safeInvoke('delete-note', id),
  toggleFavoriteNote: (id) => safeInvoke('toggle-favorite-note', id),
  togglePinNote: (id) => safeInvoke('toggle-pin-note', id),
  updateNoteDate: (id, newDateStr) => safeInvoke('update-note-date', id, newDateStr),
  reorderNotes: (orderedIds) => safeInvoke('reorder-notes', orderedIds),

  // ── Categories ─────────────────────────────────────────────
  getCategories: () => safeInvoke('get-categories'),
  saveCategory: (cat) => safeInvoke('save-category', cat),
  deleteCategory: (id) => safeInvoke('delete-category', id),

  // ── Settings ───────────────────────────────────────────────
  getSettings: () => safeInvoke('get-settings'),
  saveSetting: (key, value) => safeInvoke('save-setting', { key, value }),
  selectDataLocation: () => safeInvoke('select-data-location'),
  exportData: () => safeInvoke('export-data'),
  importData: () => safeInvoke('import-data'),

  // ── Stats ──────────────────────────────────────────────────
  getStats: () => safeInvoke('get-stats'),
  getAppInfo: () => safeInvoke('get-app-info'),

  // ── Events ─────────────────────────────────────────────────
  onClipboardChanged: (callback) => safeOn('clipboard-changed', callback),
  onSettingsChanged: (callback) => safeOn('settings-changed', callback),
  onNavigate: (callback) => safeOn('navigate', callback),

  // ── Utilities ──────────────────────────────────────────────
  openExternal: (url) => safeInvoke('open-external', url),
  
  // Modal açık/kapalı durumunu main process'e bildir (blur→tray koruması için)
  setModalOpen: (isOpen) => ipcRenderer.send('set-modal-open', isOpen),
});
