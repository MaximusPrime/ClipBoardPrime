/**
 * ClipBoardPrime — Preload Script
 * ================================
 * contextBridge ile güvenli IPC köprüsü.
 * Renderer process'e sadece izin verilen kanalları açar.
 */

const { contextBridge, ipcRenderer } = require('electron');

function getBootstrapSettings() {
  try {
    const prefix = '--cbp-bootstrap=';
    const argument = process.argv.find((value) => value.startsWith(prefix));
    if (!argument) return null;
    return JSON.parse(
      Buffer.from(argument.slice(prefix.length), 'base64url').toString('utf8')
    );
  } catch {
    return null;
  }
}

// İzin verilen IPC kanalları (güvenlik için whitelist)
const ALLOWED_INVOKE_CHANNELS = [
  'get-clipboard-history',
  'delete-clipboard-item',
  'update-clipboard-item',
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
  'show-clipboard-context-menu',
  'set-workspace-mode',
  'reset-window-bounds',
  'get-privilege-status',
  'relaunch-as-administrator',
  'find-legacy-backups',
  'import-detected-backup',
  'set-modal-open',
];

const ALLOWED_ON_CHANNELS = [
  'clipboard-changed',
  'settings-changed',
  'navigate',
  'window-visibility-changed',
  'clipboard-context-action',
  'workspace-mode-changed',
  'history-cleaned',
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
  getCachedSettings: () => getBootstrapSettings(),

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
  updateClipboardItem: (id, content) => safeInvoke('update-clipboard-item', { id, content }),
  pasteToActiveWindow: (params) => safeInvoke('paste-to-active-window', params),
  revealSensitiveContent: (id) => safeInvoke('reveal-sensitive-content', id),
  cleanupOrphanImages: () => safeInvoke('cleanup-orphan-images'),
  showClipboardContextMenu: (item) => safeInvoke('show-clipboard-context-menu', item),
  setWorkspaceMode: (mode) => safeInvoke('set-workspace-mode', mode),
  resetWindowBounds: () => safeInvoke('reset-window-bounds'),
  getPrivilegeStatus: () => safeInvoke('get-privilege-status'),
  relaunchAsAdministrator: () => safeInvoke('relaunch-as-administrator'),

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
  exportData: (password) => safeInvoke('export-data', { password }),
  importData: (password) => safeInvoke('import-data', { password }),
  findLegacyBackups: () => safeInvoke('find-legacy-backups'),
  importDetectedBackup: (filePath, password) => safeInvoke('import-detected-backup', { filePath, password }),

  // ── Stats ──────────────────────────────────────────────────
  getStats: () => safeInvoke('get-stats'),
  getAppInfo: () => safeInvoke('get-app-info'),

  // ── Events ─────────────────────────────────────────────────
  onClipboardChanged: (callback) => safeOn('clipboard-changed', callback),
  onSettingsChanged: (callback) => safeOn('settings-changed', callback),
  onNavigate: (callback) => safeOn('navigate', callback),
  onWindowVisibilityChanged: (callback) => safeOn('window-visibility-changed', callback),
  onClipboardContextAction: (callback) => safeOn('clipboard-context-action', callback),
  onWorkspaceModeChanged: (callback) => safeOn('workspace-mode-changed', callback),
  onHistoryCleaned: (callback) => safeOn('history-cleaned', callback),

  // ── Utilities ──────────────────────────────────────────────
  openExternal: (url) => safeInvoke('open-external', url),
  
  // Modal açık/kapalı durumunu main process'e bildir (blur→tray koruması için)
  setModalOpen: (isOpen) => safeInvoke('set-modal-open', isOpen),
});
