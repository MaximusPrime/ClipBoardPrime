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
  // ── Clipboard ──────────────────────────────────────────────
  getClipboardHistory: (params) => safeInvoke('get-clipboard-history', params),
  deleteClipboardItem: (id) => safeInvoke('delete-clipboard-item', id),
  clearClipboardHistory: () => safeInvoke('clear-clipboard-history'),
  togglePinClipboard: (id) => safeInvoke('toggle-pin-clipboard', id),
  toggleFavoriteClipboard: (id) => safeInvoke('toggle-favorite-clipboard', id),
  copyToClipboard: (content, type, ignoreChange = true) => safeInvoke('copy-to-clipboard', { content, type, ignoreChange }),
  clipToNote: (id) => safeInvoke('clip-to-note', id),
  pasteToActiveWindow: (content) => safeInvoke('paste-to-active-window', content),

  // ── Notes ──────────────────────────────────────────────────
  getNotes: (params) => safeInvoke('get-notes', params),
  saveNote: (note) => safeInvoke('save-note', note),
  deleteNote: (id) => safeInvoke('delete-note', id),
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

  // ── Events ─────────────────────────────────────────────────
  onClipboardChanged: (callback) => safeOn('clipboard-changed', callback),
  onSettingsChanged: (callback) => safeOn('settings-changed', callback),
  onNavigate: (callback) => safeOn('navigate', callback),

  // ── Utilities ──────────────────────────────────────────────
  openExternal: (url) => safeInvoke('open-external', url),
});
