/**
 * ClipBoard Prime — Electron Main Process
 * ========================================
 * Uygulama penceresi, system tray, clipboard izleme,
 * ve tüm IPC handler'ları.
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  nativeImage,
  globalShortcut,
  Tray,
  Menu,
  dialog,
  shell,
  protocol,
  net,
  screen,
  safeStorage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec, execFile } = require('child_process');
const { Worker } = require('worker_threads');
const {
  WORKSPACE_MODES,
  normalizeWorkspaceMode,
  workspaceBoundsKey,
  defaultWorkspaceBounds: getDefaultWorkspaceBounds,
} = require('./lib/window-profiles');
const {
  requireHexColor,
  requireCategoryIcon,
  validateExternalUrl,
} = require('./lib/input-validation');
const { htmlToPlainText } = require('./lib/content-utils');

// ─── Win32 API ve koffi Tanımlamaları ──────────────────────────
let koffi = null;
let GetForegroundWindow = null;
let SetForegroundWindow = null;
let GetClassNameA = null;
let SendInput = null;
let INPUT = null;
let lastActiveWindowHwnd = null;
let GetLastError = null;
let IsUserAnAdmin = null;

if (process.platform === 'win32') {
  try {
    koffi = require('koffi');
    const user32 = koffi.load('user32.dll');

    const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
      dx: 'long',
      dy: 'long',
      mouseData: 'uint32_t',
      dwFlags: 'uint32_t',
      time: 'uint32_t',
      dwExtraInfo: 'uintptr_t'
    });

    const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
      wVk: 'uint16_t',
      wScan: 'uint16_t',
      dwFlags: 'uint32_t',
      time: 'uint32_t',
      dwExtraInfo: 'uintptr_t'
    });

    const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', {
      uMsg: 'uint32_t',
      wParamL: 'uint16_t',
      wParamH: 'uint16_t'
    });

    const INPUT_UNION = koffi.union('INPUT_UNION', {
      mi: MOUSEINPUT,
      ki: KEYBDINPUT,
      hi: HARDWAREINPUT
    });

    INPUT = koffi.struct('INPUT', {
      type: 'uint32_t',
      u: INPUT_UNION
    });

    GetForegroundWindow = user32.func('void *GetForegroundWindow()');
    SetForegroundWindow = user32.func('bool SetForegroundWindow(void *hWnd)');
    GetClassNameA = user32.func('int GetClassNameA(void *hWnd, char *lpClassName, int nMaxCount)');
    SendInput = user32.func('uint32_t SendInput(uint32_t cInputs, INPUT *pInputs, int cbSize)');

    const kernel32 = koffi.load('kernel32.dll');
    GetLastError = kernel32.func('uint32_t GetLastError()');
    const shell32 = koffi.load('shell32.dll');
    IsUserAnAdmin = shell32.func('bool IsUserAnAdmin()');
  } catch (err) {
    console.error('Koffi loading or Win32 API initialization failed:', err);
  }
}

function getActiveWindowClassName() {
  if (!GetForegroundWindow || !GetClassNameA) return '';
  try {
    const hwnd = GetForegroundWindow();
    if (!hwnd) return '';
    const buf = Buffer.alloc(256);
    const len = GetClassNameA(hwnd, buf, 256);
    return buf.toString('ascii', 0, len).trim();
  } catch (e) {
    console.error('getActiveWindowClassName hatası:', e);
    return '';
  }
}

function isValidTargetWindow(hwnd) {
  if (!hwnd) return false;
  if (!GetClassNameA) return true;
  try {
    const buf = Buffer.alloc(256);
    const len = GetClassNameA(hwnd, buf, 256);
    const className = buf.toString('ascii', 0, len).trim();
    
    // Masaüstü, Görev çubuğu ve bildirim pencereleri geçersiz yapıştırma hedefleridir
    if (className === 'Progman' || className === 'WorkerW' || className === 'Shell_TrayWnd' || className === 'NotifyIconOverflowWindow') {
      return false;
    }
    
    // ClipBoardPrime'ın kendi penceresini de hedef yapıştırma penceresi olarak kaydetmiyoruz
    if (mainWindow && !mainWindow.isDestroyed()) {
      const mainHandle = mainWindow.getNativeWindowHandle();
      if (mainHandle && Buffer.isBuffer(hwnd) && Buffer.compare(mainHandle, hwnd) === 0) {
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error('isValidTargetWindow hatası:', err);
    return true;
  }
}

// Geliştirme modu ve Portable mod tespiti
const isDev = process.argv.includes('--dev');
const isE2E = process.argv.includes('--e2e') && Boolean(process.env.CBP_E2E_USER_DATA);
if (isE2E) {
  app.setPath('userData', path.resolve(process.env.CBP_E2E_USER_DATA));
}
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;

// Taşınabilir (Portable) veya Geliştirme moduna göre userData dizini ata
if (isPortable) {
  const portableDataPath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');
  app.setPath('userData', portableDataPath);
} else if (isDev) {
  const legacyDevDataPath = path.join(app.getPath('appData'), 'clipboard-pro-app-dev');
  const devDataPath = path.join(app.getPath('appData'), 'clipboard-prime-app-dev');
  if (!fs.existsSync(devDataPath) && fs.existsSync(legacyDevDataPath)) {
    fs.renameSync(legacyDevDataPath, devDataPath);
  }
  app.setPath('userData', devDataPath);
}

// Şifreleme Anahtarı Yönetimi (electron-store yerine yerel config.json)
function getOrCreateEncryptionKey() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.error('Konfigürasyon dosyası okunamadı:', err);
  }

  if (config.protectedEncryptionKey) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('İşletim sistemi güvenli anahtar deposu kullanılamıyor.');
    }
    return safeStorage.decryptString(
      Buffer.from(config.protectedEncryptionKey, 'base64')
    );
  }

  const key = config.encryptionKey || crypto.randomBytes(32).toString('hex');
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('İşletim sistemi güvenli anahtar deposu kullanılamıyor.');
  }

  config.protectedEncryptionKey = safeStorage.encryptString(key).toString('base64');
  delete config.encryptionKey;
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  return key;
}

let encryptionKey = null;
const db = require('./database/db');

/**
 * config.json'dan özel veri konumunu okur.
 * Bu dosya her zaman userData dizininde bulunur ve DB'den bağımsızdır.
 */
function getCustomDataLocation() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.dataLocation || '';
    }
  } catch (err) {
    console.error('Config dosyasından dataLocation okunamadı:', err);
  }
  return '';
}

/**
 * config.json'a özel veri konumunu yazar.
 * Yeniden başlatmada doğru konum okunabilsin diye DB'den bağımsız saklanır.
 */
function saveCustomDataLocation(location) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.error('Config okuma hatası (saveCustomDataLocation):', err);
  }
  config.dataLocation = location || '';
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Config dosyasına dataLocation yazılamadı:', err);
  }
}

let isWritingToClipboard = false;

function requirePositiveInteger(value, fieldName = 'Kimlik') {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} geçerli bir pozitif tam sayı olmalıdır.`);
  }
  return parsed;
}

function requireString(value, fieldName, maxLength) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} metin olmalıdır.`);
  }
  if (maxLength && value.length > maxLength) {
    throw new Error(`${fieldName} en fazla ${maxLength} karakter olabilir.`);
  }
  return value;
}

function requireBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} doğru/yanlış değeri olmalıdır.`);
  }
  return value;
}

function requireDateString(value, fieldName = 'Tarih') {
  const dateString = requireString(value, fieldName, 64);
  if (Number.isNaN(Date.parse(dateString))) {
    throw new Error(`${fieldName} geçerli bir tarih olmalıdır.`);
  }
  return dateString;
}

function requireIdOrderList(value) {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new Error('Sıralama verisi geçerli bir dizi olmalıdır.');
  }
  return value.map((item, index) => ({
    id: requirePositiveInteger(item && item.id, 'Not kimliği'),
    sort_order: Number.isSafeInteger(Number(item && item.sort_order))
      ? Number(item.sort_order)
      : index,
  }));
}

const ALLOWED_SETTING_KEYS = new Set([
  'theme', 'appFontSize', 'maxHistory', 'pollingInterval', 'startWithWindows',
  'dataLocation', 'globalShortcut', 'showPreview', 'detectSensitive',
  'blurToTray', 'language', 'leftPanelWidth', 'leftPanelWidthRatio',
  'windowBounds', 'trayBalloonShown', 'clearSearchOnHide',
  'clearNotesSearchOnHide', 'hideAfterPaste',
  'windowOpenPosition', 'clipboardOpenFilter', 'notesOpenFilter',
  'clipboardFilterOrder',
  'notesFilterOrder',
  'clipboardQuickActions', 'clipboardQuickActionOrder',
  'workspaceMode', 'workspaceOpenMode', 'dualWindowBounds',
  'clipboardWindowBounds', 'notesWindowBounds',
  'spaceKeyAction', 'hoverPreviewEnabled', 'hoverPreviewDelay',
  'expandedClickOpensModal',
  'clipboardClickOpensPreview',
  'noteContentClickOpensModal',
  'clipboardDoubleClickPaste',
  'noteDoubleClickOpensModal',
  'interactionSettingsMigrated',
  'showKeyboardHelp',
  'retentionDays', 'retentionKeepFavorites', 'retentionTypeRules',
  'onboardingCompleted',
  'notesGlobalShortcut',
]);

function validateSetting(key, value) {
  key = requireString(key, 'Ayar anahtarı', 64);
  if (!ALLOWED_SETTING_KEYS.has(key)) {
    throw new Error('Desteklenmeyen ayar anahtarı.');
  }
  return { key, value: requireString(value, 'Ayar değeri', 10_000) };
}

/**
 * Converts stored rich HTML into safe readable plain text for plain copy/paste.
 */
function getClipboardMenuLabels() {
  const language = db.getSetting('language') || 'en';
  const labels = {
    tr: {
      paste: 'Yapıştır',
      pastePlain: 'Düz Metin Olarak Yapıştır',
      copy: 'Kopyala',
      copyPlain: 'Düz Metin Olarak Kopyala',
      pin: 'Sabitle',
      unpin: 'Sabitlemeyi Kaldır',
      favorite: 'Favorilere Ekle',
      unfavorite: 'Favorilerden Çıkar',
      note: 'Not Olarak Kaydet',
      details: 'Detayları Göster',
      delete: 'Sil',
    },
    en: {
      paste: 'Paste',
      pastePlain: 'Paste as Plain Text',
      copy: 'Copy',
      copyPlain: 'Copy as Plain Text',
      pin: 'Pin',
      unpin: 'Unpin',
      favorite: 'Add to Favorites',
      unfavorite: 'Remove from Favorites',
      note: 'Save as Note',
      details: 'Show Details',
      delete: 'Delete',
    },
    zh: {
      paste: '粘贴',
      pastePlain: '粘贴为纯文本',
      copy: '复制',
      copyPlain: '复制为纯文本',
      pin: '固定',
      unpin: '取消固定',
      favorite: '添加到收藏夹',
      unfavorite: '从收藏夹移除',
      note: '保存为笔记',
      details: '显示详情',
      delete: '删除',
    },
    'pt-BR': {
      paste: 'Colar',
      pastePlain: 'Colar como Texto Simples',
      copy: 'Copiar',
      copyPlain: 'Copiar como Texto Simples',
      pin: 'Fixar',
      unpin: 'Desafixar',
      favorite: 'Adicionar aos Favoritos',
      unfavorite: 'Remover dos Favoritos',
      note: 'Salvar como Nota',
      details: 'Mostrar Detalhes',
      delete: 'Excluir',
    }
  };
  return labels[language] || labels.en;
}

function runDatabaseTask(action, payload = {}) {
  if (!activeDataDir || !encryptionKey) {
    return Promise.reject(new Error('Veritabanı görevi için uygulama hazır değil.'));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'database', 'db-task-worker.js'), {
      workerData: {
        action,
        payload,
        dataDirectory: activeDataDir,
        encryptionKey,
      },
    });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    worker.once('message', (message) => {
      if (message && message.success) finish(resolve, message.data);
      else finish(reject, new Error(message?.error || 'Veritabanı görevi başarısız.'));
    });
    worker.once('error', (error) => finish(reject, error));
    worker.once('exit', (code) => {
      if (code !== 0) finish(reject, new Error(`Veritabanı worker işlemi ${code} koduyla kapandı.`));
    });
  });
}

function getLegacyBackupSearchDirectories() {
  const directories = new Set();
  const add = (value) => {
    if (value && fs.existsSync(value)) directories.add(path.resolve(value));
  };
  for (const name of ['documents', 'downloads', 'desktop']) {
    try { add(app.getPath(name)); } catch {}
  }
  const appData = app.getPath('appData');
  ['clipboard-pro-app', 'clipboard-pro-app-dev', 'clipboard-prime-app',
    'clipboard-prime-app-dev', 'ClipBoardPrime', 'ClipboardPro']
    .forEach((name) => add(path.join(appData, name)));
  add(activeDataDir);
  return [...directories];
}

function findLegacyBackups() {
  const results = [];
  for (const directory of getLegacyBackupSearchDirectories()) {
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const extension = path.extname(entry.name).toLowerCase();
      if (!entry.isFile() || !['.json', '.cpbackup'].includes(extension)) continue;
      if (!/(clipboard|clip-board|pano|backup|yedek)/i.test(entry.name)) continue;
      const filePath = path.join(directory, entry.name);
      try {
        const stat = fs.statSync(filePath);
        if (stat.size <= 0 || stat.size > 512 * 1024 * 1024) continue;
        results.push({
          path: filePath,
          name: entry.name,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          encrypted: extension === '.cpbackup',
        });
      } catch {}
    }
  }
  return results.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 12);
}

function validateDetectedBackupPath(filePath) {
  const resolved = path.resolve(requireString(filePath, 'Yedek yolu', 4096));
  if (!findLegacyBackups().some((item) => path.resolve(item.path) === resolved)) {
    throw new Error('Seçilen dosya güvenli yedek taramasında bulunamadı.');
  }
  return resolved;
}

/**
 * Metni AES-256-GCM ile şifreler.
 */
function encryptText(text) {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(12);
    const keyBuffer = Buffer.from(encryptionKey, 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}.${encrypted}.${authTag}`;
  } catch (err) {
    console.error('Şifreleme hatası:', err);
    return text;
  }
}

function fingerprintText(text) {
  return crypto
    .createHmac('sha256', Buffer.from(encryptionKey, 'hex'))
    .update(text || '', 'utf8')
    .digest('hex');
}

/**
 * AES-256-GCM şifrelenmiş metni çözer.
 */
function decryptText(encryptedText) {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split('.');
    if (parts.length !== 3) {
      return encryptedText;
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const authTag = Buffer.from(parts[2], 'hex');
    
    const keyBuffer = Buffer.from(encryptionKey, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Şifre çözme hatası:', err);
    return encryptedText;
  }
}

// local-file protokol şemasını kaydet (app ready olmadan önce çağrılmalı)
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { bypassCSP: true, secure: true, supportFetchAPI: true } }
]);

// ─── Genel Değişkenler ──────────────────────────────────────
let mainWindow = null;
let tray = null;
let clipboardWatcher = null;
let historyCleanupTimer = null;
let isQuitting = false;
let lastClipboardText = '';
let lastClipboardHtml = '';
let lastClipboardImageHash = '';
let lastFormats = [];
let lastImageSize = { width: 0, height: 0 };
let lastImageHashCheckAt = 0;
/** Content signature of the last item actually imported (ignores Windows format noise). */
let lastImportedContentSignature = '';
let trayBalloonShown = false;
// DB'nin gerçekte başlatıldığı dizin (effectiveLocation ile senkronize tutulur)
// handleNewImage ve benzeri fonksiyonlar bunu kullanır — getDbPath() null kalsa da güvende oluruz.
let activeDataDir = null;
let isModalOpen = false;
let lastBlurTime = 0;
let isApplyingWorkspaceBounds = false;
let workspaceBoundsTransitionId = 0;
let workspaceBoundsReleaseTimer = null;
let fatalErrorInProgress = false;
let modalProtectionUntil = 0;
const startHidden = process.argv.includes('--hidden') || process.argv.includes('--startup');

/**
 * Portable veya setup sürümüne göre asıl çalıştırılabilir dosya yolunu döner.
 */
function getApplicationExePath() {
  if (isPortable) {
    return process.env.PORTABLE_EXECUTABLE_FILE ||
      process.env.PORTABLE_EXECUTABLE_PATH ||
      (process.env.PORTABLE_EXECUTABLE_DIR
        ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, path.basename(app.getPath('exe')))
        : app.getPath('exe'));
  }
  return app.getPath('exe');
}

/**
 * Windows başlangıç ayarlarını registry üzerinden günceller.
 */
function setWindowsAutostart(enabled) {
  const exePath = getApplicationExePath();
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const valName = 'ClipBoardPrime';

  if (enabled) {
    const regValue = `"${exePath}" --hidden`;
    execFile('reg', ['add', regKey, '/v', valName, '/t', 'REG_SZ', '/d', regValue, '/f'], (err) => {
      if (err) {
        console.error('Registry autostart ekleme hatası:', err);
      }
    });
  } else {
    execFile('reg', ['delete', regKey, '/v', valName, '/f'], (err) => {
      if (err && !err.message.includes('bulunamadı') && !err.message.includes('not find')) {
        console.error('Registry autostart kaldırma hatası:', err);
      }
    });
  }
}



const gotTheLock = isE2E || app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// ═══════════════════════════════════════════════════════════════
// Pencere Oluşturma
// ═══════════════════════════════════════════════════════════════

function createWindow() {
  // Kaydedilmiş pencere konumu ve boyutunu oku
  // Varsayılan olarak en küçük boyutta (900x600) başlasın
  let windowBounds = { width: 540, height: 640 };
  let isFirstRun = false;
  let initialMode = 'clipboard';
  try {
    if (db.isReady()) {
      initialMode = resolveWorkspaceOpenMode();
      db.saveSetting('workspaceMode', initialMode);
      const savedBounds = db.getSetting(workspaceBoundsKey(initialMode));
      if (savedBounds) {
        windowBounds = { ...windowBounds, ...JSON.parse(savedBounds) };
      } else {
        isFirstRun = true;
      }
      windowBounds = constrainBoundsToDisplay({
        ...defaultWorkspaceBounds(initialMode),
        ...windowBounds,
      });
    }
  } catch (err) {
    // Kayıtlı konum yoksa varsayılan kullan
  }

  // İlk çalıştırmada pencereyi ekranın sağ alt köşesine konumlandır
  if (isFirstRun) {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: sw, height: sh } = primaryDisplay.workAreaSize;
      windowBounds.x = sw - windowBounds.width - 16;
      windowBounds.y = sh - windowBounds.height - 16;
    } catch (e) { /* merkeze bırak */ }
  }

  const bootstrapSettings = db.isReady()
    ? {
        theme: db.getSetting('theme') || 'dark',
      }
    : {};
  const bootstrapArgument = Buffer.from(
    JSON.stringify(bootstrapSettings),
    'utf8'
  ).toString('base64url');

  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: 420,
    minHeight: 520,
    frame: true,
    show: false, // ready-to-show ile göster (flicker engelleme)
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      additionalArguments: [`--cbp-bootstrap=${bootstrapArgument}`],
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  if (isE2E) {
    mainWindow.webContents.once('did-finish-load', () => {
      runE2EScenarios().catch((error) => {
        process.stdout.write(`CBP_E2E_ERROR:${error.stack || error.message}\n`);
        app.exit(1);
      });
    });
  }

  // DevTools sadece --dev argümanı varken aç
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Pencere hazır olunca göster (beyaz flaş engelleme)
  // --hidden veya --startup argümanıyla başlatıldıysa pencereyi gösterme
  mainWindow.once('ready-to-show', () => {
    if (!startHidden) {
      showWindow();
    }
  });

  mainWindow.on('show', () => {
    mainWindow.webContents.send('window-visibility-changed', {
      visible: true,
      mode: normalizeWorkspaceMode(db.getSetting('workspaceMode')),
    });
  });

  mainWindow.on('hide', () => {
    mainWindow.webContents.send('window-visibility-changed', { visible: false });
  });

  // Kapatma → tray'e küçült (gerçekten kapatma)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (!trayBalloonShown && tray) {
        try {
          tray.displayBalloon({
            title: getTranslation('tray.balloonTitle'),
            content: getTranslation('tray.balloonContent'),
          });
          trayBalloonShown = true;
          // DB'ye kalıcı olarak kaydet ki sonraki açılışlarda gösterilmesin
          try { db.saveSetting('trayBalloonShown', 'true'); } catch (e) {}
        } catch (balloonErr) {
          console.error('Tray balon bildirimi gösterilemedi:', balloonErr);
        }
      }
    }
  });

  // Pencere odak kaybedince tray'e gizle — modül scope'taki debounced handler'a bağla
  mainWindow.on('blur', () => {
    _blurHandlerDebounced();
  });

  // Pencere boyutu/konumu değişince kaydet
  const saveBoundsDebounced = debounce(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !isApplyingWorkspaceBounds) {
      try {
        const bounds = mainWindow.getBounds();
        db.saveSetting(workspaceBoundsKey(db.getSetting('workspaceMode')), JSON.stringify(bounds));
      } catch (err) {
        // Kayıt hatası görmezden gel
      }
    }
  }, 500);

  mainWindow.on('resize', saveBoundsDebounced);
  mainWindow.on('move', saveBoundsDebounced);

  // Pencere kapandığında referansı temizle
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ═══════════════════════════════════════════════════════════════
// System Tray
// ═══════════════════════════════════════════════════════════════

/**
 * Uygulama (pencere ve görev çubuğu) ikonu yolunu döner.
 */
function getAppIconPath() {
  const icoPath = path.join(__dirname, 'assets', 'icon.ico');
  if (fs.existsSync(icoPath)) {
    return icoPath;
  }
  const buildIcoPath = path.join(__dirname, 'build', 'icon.ico');
  if (fs.existsSync(buildIcoPath)) {
    return buildIcoPath;
  }
  const pngPath = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(pngPath)) {
    return pngPath;
  }
  return getTrayIconPath();
}

/**
 * Tray ikonu yolunu döner. Windows uyumluluğu için öncelikle .ico dosyalarını kontrol eder.
 */
function getTrayIconPath() {
  const trayIcoPath = path.join(__dirname, 'assets', 'tray-icon.ico');
  if (fs.existsSync(trayIcoPath)) {
    return trayIcoPath;
  }

  const icoPath = path.join(__dirname, 'assets', 'icon.ico');
  if (fs.existsSync(icoPath)) {
    return icoPath;
  }
  
  const buildIcoPath = path.join(__dirname, 'build', 'icon.ico');
  if (fs.existsSync(buildIcoPath)) {
    return buildIcoPath;
  }

  const pngPath = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(pngPath)) {
    return pngPath;
  }

  return null;
}

function createTrayIcon() {
  const iconPath = getTrayIconPath();
  if (iconPath && fs.existsSync(iconPath)) {
    if (iconPath.endsWith('.ico')) {
      return iconPath;
    }
    return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  }
  // Acil durum yedeği (PNG Data URL - SVG Electron nativeImage tarafından desteklenmez)
  const fallbackDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABCSURBVDhPY2AYBaNgFIwEAAAXAAEBHmU3AAAAAElFTkSuQmCC';
  return nativeImage.createFromDataURL(fallbackDataUrl);
}

/**
 * Resolves localized strings for main process elements (like tray).
 */
function getTranslation(key) {
  try {
    let lang = 'en';
    if (db) {
      lang = db.getSetting('language') || 'en';
    }
    const localePath = path.join(__dirname, 'src', 'locales', `${lang}.json`);
    if (fs.existsSync(localePath)) {
      const data = JSON.parse(fs.readFileSync(localePath, 'utf8'));
      const value = key.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), data);
      if (typeof value === 'string') return value;
    }
  } catch (err) {
    console.error('getTranslation error:', err);
  }
  
  // Fallbacks
  const fallbacks = {
    'tr': {
      'tray.show': 'Göster',
      'tray.settings': 'Ayarlar',
      'tray.exit': 'Çıkış',
      'tray.balloonTitle': 'ClipBoardPrime',
      'tray.balloonContent': 'Uygulama sistem tepsisinde çalışmaya devam ediyor. Açmak için sistem tepsisi simgesine tıklayabilir veya Ctrl+Shift+V kısayolunu kullanabilirsiniz.',
    },
    'en': {
      'tray.show': 'Show',
      'tray.settings': 'Settings',
      'tray.exit': 'Exit',
      'tray.balloonTitle': 'ClipBoardPrime',
      'tray.balloonContent': 'Application continues running in the system tray. Click the tray icon or use the Ctrl+Shift+V shortcut to open.',
    },
    'zh': {
      'tray.show': '显示',
      'tray.settings': '设置',
      'tray.exit': '退出',
      'tray.balloonTitle': 'ClipBoardPrime',
      'tray.balloonContent': '应用程序将在系统托盘后台继续运行。点击托盘图标或使用 Ctrl+Shift+V 快捷键即可打开。',
    },
    'pt-BR': {
      'tray.show': 'Mostrar',
      'tray.settings': 'Configurações',
      'tray.exit': 'Sair',
      'tray.balloonTitle': 'ClipBoardPrime',
      'tray.balloonContent': 'O aplicativo continua em execução na bandeja do sistema. Clique no ícone da bandeja ou use o atalho Ctrl+Shift+V para abrir.',
    }
  };
  let lang = 'en';
  if (db) {
    lang = db.getSetting('language') || 'en';
  }
  const langFallbacks = fallbacks[lang] || fallbacks['en'];
  return langFallbacks[key] || key;
}

/**
 * Updates the tray context menu language dynamically.
 */
function updateTrayMenu() {
  if (!tray) return;

  const showLabel = getTranslation('tray.show');
  const settingsLabel = getTranslation('tray.settings');
  const exitLabel = getTranslation('tray.exit');
  const clipboardLabel = getTranslation('tray.openClipboard');
  const notesLabel = getTranslation('tray.openNotes');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: clipboardLabel,
      click: () => {
        applyWorkspaceMode('clipboard');
        showWindow();
      },
    },
    {
      label: notesLabel,
      click: () => {
        applyWorkspaceMode('notes');
        showWindow();
      },
    },
    {
      label: settingsLabel,
      click: () => {
        showWindow();
        // Ayarlar sayfasını aç
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('navigate', 'settings');
        }
      },
    },
    { type: 'separator' },
    {
      label: exitLabel,
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * System tray'i oluşturur.
 */
function createTray() {
  const iconPath = getTrayIconPath();
  let trayIcon;

  if (iconPath && fs.existsSync(iconPath)) {
    if (iconPath.endsWith('.ico')) {
      trayIcon = iconPath;
    } else {
      trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    }
  } else {
    trayIcon = createTrayIcon();
  }

  tray = new Tray(trayIcon);
  
  tray.setToolTip('ClipBoardPrime');

  updateTrayMenu();

  // Tray'e tıklayınca göster/gizle
  tray.on('click', () => {
    toggleWindow();
  });
}


// ═══════════════════════════════════════════════════════════════
// Pencere Yardımcı Fonksiyonlar
// ═══════════════════════════════════════════════════════════════

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (!mainWindow.isVisible() && GetForegroundWindow) {
    const activeHwnd = GetForegroundWindow();
    if (isValidTargetWindow(activeHwnd)) {
      lastActiveWindowHwnd = activeHwnd;
    }
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  positionWindowForOpen();
  // Windows Snap/Aero tek pencere yöneticisi olsun. Ekran dışı kalmış bir
  // konumu yalnızca pencere gizliyken, gösterilmeden hemen önce düzelt.
  if (!mainWindow.isVisible() && !mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
    const current = mainWindow.getBounds();
    const constrained = constrainBoundsToDisplay(current);
    const changed = ['x', 'y', 'width', 'height']
      .some((key) => current[key] !== constrained[key]);
    if (changed) mainWindow.setBounds(constrained, false);
  }
  mainWindow.show();
  mainWindow.focus();
}

async function runE2EScenarios() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  mainWindow.show();
  mainWindow.focus();
  await wait(250);
  const initialBounds = mainWindow.getBounds();
  mainWindow.setSize(initialBounds.width, 520, false);
  await wait(200);
  const onboarding = await mainWindow.webContents.executeJavaScript(`(() => {
    const modal = document.getElementById('onboarding-modal');
    const dialog = modal.querySelector('.onboarding-modal');
    return {
      active: modal.classList.contains('active'),
      clientHeight: dialog.clientHeight,
      scrollHeight: dialog.scrollHeight,
      viewportHeight: window.innerHeight,
      theme: document.documentElement.getAttribute('data-theme'),
    };
  })()`);

  await mainWindow.webContents.executeJavaScript(
    `document.getElementById('onboarding-theme').value = 'light';
     document.getElementById('onboarding-theme').dispatchEvent(new Event('change', { bubbles: true }));`
  );
  const liveTheme = await mainWindow.webContents.executeJavaScript(
    `document.documentElement.getAttribute('data-theme')`
  );

  await mainWindow.webContents.executeJavaScript(`window.api.setModalOpen(true)`);
  db.saveSetting('blurToTray', 'true');
  mainWindow.emit('blur');
  await wait(160);
  const modalBlurProtected = mainWindow.isVisible();
  await mainWindow.webContents.executeJavaScript(`window.api.setModalOpen(false)`);
  db.saveSetting('blurToTray', 'false');

  applyWorkspaceMode('clipboard');
  await wait(450);
  const compact = {
    bounds: mainWindow.getBounds(),
    resizable: mainWindow.isResizable(),
    rendererMode: await mainWindow.webContents.executeJavaScript(
      `document.getElementById('app').classList.contains('workspace-clipboard')`
    ),
  };

  applyWorkspaceMode('notes');
  await wait(450);
  const notes = {
    bounds: mainWindow.getBounds(),
    resizable: mainWindow.isResizable(),
    rendererMode: await mainWindow.webContents.executeJavaScript(
      `document.getElementById('app').classList.contains('workspace-notes')`
    ),
  };

  const switchBoundsBefore = mainWindow.getBounds();
  for (let index = 0; index < 12; index += 1) {
    applyWorkspaceMode(index % 2 === 0 ? 'clipboard' : 'notes');
  }
  await wait(200);
  const switchBoundsAfter = mainWindow.getBounds();
  const workspaceSwitchKeepsBounds = ['x', 'y', 'width', 'height']
    .every((key) => switchBoundsBefore[key] === switchBoundsAfter[key]);

  applyWorkspaceMode('clipboard', {
    persist: false,
    bounds: { x: -100000, y: -100000, width: 540, height: 640 },
  });
  await wait(450);
  const recoveredBounds = mainWindow.getBounds();
  const nearestArea = screen.getDisplayNearestPoint({
    x: recoveredBounds.x,
    y: recoveredBounds.y,
  }).workArea;
  const boundsRecovered = (
    recoveredBounds.x >= nearestArea.x
    && recoveredBounds.y >= nearestArea.y
    && recoveredBounds.x + recoveredBounds.width <= nearestArea.x + nearestArea.width
    && recoveredBounds.y + recoveredBounds.height <= nearestArea.y + nearestArea.height
  );

  const reloaded = new Promise((resolve) => {
    mainWindow.webContents.once('did-finish-load', resolve);
  });
  mainWindow.webContents.reload();
  await reloaded;
  await wait(350);
  const reloadState = await mainWindow.webContents.executeJavaScript(`({
    appReady: Boolean(window.App && window.App.settings),
    mainVisible: getComputedStyle(document.querySelector('.main-content')).opacity === '1',
    onboardingPresent: Boolean(document.getElementById('onboarding-modal')),
  })`);

  process.stdout.write(`CBP_E2E_RESULT:${JSON.stringify({
    onboarding,
    liveTheme,
    modalBlurProtected,
    compact,
    notes,
    workspaceSwitchKeepsBounds,
    boundsRecovered,
    reloadState,
  })}\n`);
  isQuitting = true;
  app.quit();
}

function resolveWorkspaceOpenMode() {
  if (!db.isReady()) return 'clipboard';
  const openMode = db.getSetting('workspaceOpenMode') || 'last';
  if (WORKSPACE_MODES.includes(openMode)) return openMode;
  const lastMode = db.getSetting('workspaceMode') || 'clipboard';
  return normalizeWorkspaceMode(lastMode);
}

function defaultWorkspaceBounds(mode) {
  const current = mainWindow ? mainWindow.getBounds() : { x: 100, y: 100 };
  return getDefaultWorkspaceBounds(mode, current);
}

function constrainBoundsToDisplay(bounds) {
  const safeWidth = Number.isFinite(Number(bounds.width)) ? Number(bounds.width) : 900;
  const safeHeight = Number.isFinite(Number(bounds.height)) ? Number(bounds.height) : 600;
  const safeX = Number.isFinite(Number(bounds.x)) ? Number(bounds.x) : 100;
  const safeY = Number.isFinite(Number(bounds.y)) ? Number(bounds.y) : 100;
  const display = screen.getDisplayNearestPoint({
    x: safeX + Math.round(safeWidth / 2),
    y: safeY + Math.round(safeHeight / 2),
  });
  const area = display.workArea;
  const width = Math.max(320, Math.min(safeWidth, area.width));
  const height = Math.max(400, Math.min(safeHeight, area.height));
  return {
    width,
    height,
    x: Math.min(Math.max(safeX, area.x), area.x + area.width - width),
    y: Math.min(Math.max(safeY, area.y), area.y + area.height - height),
  };
}

function applyWorkspaceMode(mode, options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const persist = options.persist !== false;
  const safeMode = normalizeWorkspaceMode(mode);
  if (persist) {
    db.saveSetting(workspaceBoundsKey(), JSON.stringify(mainWindow.getBounds()));
  }
  if (persist) db.saveSetting('workspaceMode', safeMode);
  mainWindow.webContents.send('workspace-mode-changed', { mode: safeMode });

  // Pano ve Notlar ortak pencere profilini kullandığı için normal görünüm
  // geçişinde bounds'a dokunma; bu, Windows Snap durumunu da aynen korur.
  if (!options.bounds) return;

  const constrained = constrainBoundsToDisplay(options.bounds);
  const transitionId = ++workspaceBoundsTransitionId;
  isApplyingWorkspaceBounds = true;
  if (workspaceBoundsReleaseTimer) clearTimeout(workspaceBoundsReleaseTimer);
  mainWindow.setMinimumSize(420, 520);
  mainWindow.setResizable(true);
  mainWindow.setBounds(constrained, true);
  workspaceBoundsReleaseTimer = setTimeout(() => {
    if (transitionId === workspaceBoundsTransitionId) {
      isApplyingWorkspaceBounds = false;
      workspaceBoundsReleaseTimer = null;
    }
  }, 350);
}

function hideWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

/**
 * Applies the configured window position before the main window is shown.
 */
function positionWindowForOpen() {
  if (!mainWindow || mainWindow.isDestroyed() || !db.isReady()) return;
  if (db.getSetting('windowOpenPosition') !== 'cursor') return;

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const bounds = mainWindow.getBounds();
  const workArea = display.workArea;
  const gap = 12;
  const maxX = workArea.x + workArea.width - bounds.width;
  const maxY = workArea.y + workArea.height - bounds.height;
  const x = Math.min(Math.max(cursor.x + gap, workArea.x), maxX);
  const y = Math.min(Math.max(cursor.y + gap, workArea.y), maxY);

  mainWindow.setPosition(Math.round(x), Math.round(y), false);
}

function sendPasteWithMshta() {
  return new Promise((resolve) => {
    exec(
      'mshta vbscript:Close(CreateObject("WScript.Shell").SendKeys("^v"))',
      (error) => {
        if (error) {
          console.error('mshta fallback hatası:', error);
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true });
        }
      }
    );
  });
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  // Eğer son 200ms içinde blur tetiklendiyse, click event'i pencereyi tekrar açmasın.
  if (Date.now() - lastBlurTime < 200) {
    return;
  }

  if (mainWindow.isVisible()) {
    hideWindow();
  } else {
    if (GetForegroundWindow) {
      const activeHwnd = GetForegroundWindow();
      if (isValidTargetWindow(activeHwnd)) {
        lastActiveWindowHwnd = activeHwnd;
      }
    }
    applyWorkspaceMode(resolveWorkspaceOpenMode());
    showWindow();
  }
}

// ═══════════════════════════════════════════════════════════════
// Clipboard Monitoring
// ═══════════════════════════════════════════════════════════════

/**
 * Clipboard izlemeyi başlatır.
 */
function startClipboardWatcher() {
  try {
    // Başlangıçta mevcut OS panosunu "bilinen" say — uygulama açılınca geçmişe basma
    markOsClipboardAsKnown();
  } catch (err) {
    console.error('İlk clipboard okuma hatası:', err);
  }

  let interval = 500;
  try {
    if (db.isReady()) {
      const savedInterval = db.getSetting('pollingInterval');
      if (savedInterval) {
        interval = Math.max(200, Math.min(5000, parseInt(savedInterval) || 500));
      }
    }
  } catch (err) {
    // Varsayılan kullan
  }

  clipboardWatcher = setInterval(() => {
    try {
      checkClipboard();
    } catch (err) {
      console.error('Clipboard kontrol hatası:', err);
    }
  }, interval);
}

/**
 * Clipboard izlemeyi durdurur.
 */
function stopClipboardWatcher() {
  if (clipboardWatcher) {
    clearInterval(clipboardWatcher);
    clipboardWatcher = null;
  }
}

function runHistoryCleanup() {
  if (!db.isReady()) return;
  try {
    const deleted = db.cleanupExpiredHistory();
    if (deleted > 0 && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('history-cleaned', { deleted });
    }
  } catch (err) {
    console.error('Otomatik geçmiş temizliği başarısız:', err);
  }
}

function startHistoryCleanupTimer() {
  if (historyCleanupTimer) clearInterval(historyCleanupTimer);
  runHistoryCleanup();
  historyCleanupTimer = setInterval(runHistoryCleanup, 60 * 60 * 1000);
}

// Blur handler hızlı tetiklenmeye karşı debounce - pencere focus dalgalanmalarını engeller
const _blurHandlerDebounced = debounce(() => {
  try {
    if (!db.isReady()) return;
    if (isModalOpen || Date.now() < modalProtectionUntil) return;

    // Uygulama odağı kaybettiğinde, yeni odaklanılan geçerli pencereyi (örn. Tarayıcıyı) hedef pencere olarak kaydet.
    // Bu sayede pano açıkken başka bir uygulamaya tıklansa bile hedef pencere her zaman güncel kalır!
    if (GetForegroundWindow) {
      const activeHwnd = GetForegroundWindow();
      if (isValidTargetWindow(activeHwnd)) {
        lastActiveWindowHwnd = activeHwnd;
      }
    }

    const blurToTray = db.getSetting('blurToTray');
    if (blurToTray === 'true') {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        mainWindow.hide();
        lastBlurTime = Date.now();
      }
    }
  } catch (err) {
    // Sessizce geç
  }
}, 80);

/**
 * OS panosunun anlık içeriğini okur.
 * Not: Windows format listesi gürültülüdür; karar için text/html/imageHash kullanılır.
 */
function readOsClipboardSnapshot() {
  const text = clipboard.readText() || '';
  const html = clipboard.readHTML() || '';
  const formats = clipboard.availableFormats() || [];
  let image = null;
  let imageHash = '';

  const looksLikeImage = formats.some((f) => {
    const lower = String(f).toLowerCase();
    return lower.includes('image') || lower.includes('bitmap') || lower.includes('png') || lower.includes('jpeg');
  });

  // Görsel formatı varsa veya metin yoksa görseli oku
  if (looksLikeImage || (!text && !html)) {
    try {
      image = clipboard.readImage();
      if (image && !image.isEmpty()) {
        imageHash = hashImage(image) || '';
      } else {
        image = null;
      }
    } catch (_) {
      image = null;
      imageHash = '';
    }
  }

  return { text, html, formats, image, imageHash };
}

function contentSignatureOf(snapshot) {
  if (snapshot.imageHash) return `img:${snapshot.imageHash}`;
  const plain = String(snapshot.text || '');
  const rich = String(snapshot.html || '');
  if (rich.trim()) {
    return `html:${crypto.createHash('md5').update(rich).update('\n').update(plain).digest('hex')}`;
  }
  if (plain) {
    return `text:${crypto.createHash('md5').update(plain).digest('hex')}`;
  }
  return '';
}

/**
 * Bu OS pano içeriğini "zaten işlendi" olarak işaretler.
 * (Uygulama açılışı, kendi yazdığımız kopya, geçmiş silme/temizleme)
 */
function markOsClipboardAsKnown(snapshot = null) {
  const snap = snapshot || readOsClipboardSnapshot();
  lastClipboardText = snap.text;
  lastClipboardHtml = snap.html;
  lastFormats = snap.formats;
  lastClipboardImageHash = snap.imageHash || '';
  lastImageHashCheckAt = Date.now();
  if (snap.image && !snap.image.isEmpty()) {
    lastImageSize = snap.image.getSize();
  } else {
    lastImageSize = { width: 0, height: 0 };
  }
  lastImportedContentSignature = contentSignatureOf(snap);
}

/** Uygulama panoya yazdıktan sonra state senkronu */
function updateLastClipboardState() {
  markOsClipboardAsKnown();
}

/**
 * Tek kural: OS panosu değiştiyse ve bu içeriği daha önce işlemediysek kaydet.
 */
function checkClipboard() {
  if (isWritingToClipboard) return;

  const snap = readOsClipboardSnapshot();
  const signature = contentSignatureOf(snap);

  // Format listesi tek başına değişse bile içerik aynıysa işlem yok
  if (!signature || signature === lastImportedContentSignature) {
    lastFormats = snap.formats;
    lastClipboardText = snap.text;
    lastClipboardHtml = snap.html;
    lastClipboardImageHash = snap.imageHash || '';
    return;
  }

  // Yeni içerik
  lastClipboardText = snap.text;
  lastClipboardHtml = snap.html;
  lastFormats = snap.formats;
  lastClipboardImageHash = snap.imageHash || '';
  lastImageHashCheckAt = Date.now();

  if (snap.imageHash && snap.image && !snap.image.isEmpty()) {
    handleNewImage(snap.image, snap.imageHash);
    lastImportedContentSignature = signature;
    return;
  }

  const trimmedText = snap.text ? snap.text.trim() : '';

  if (trimmedText.length > 0) {
    if (/^https?:\/\/[^\s]+$/i.test(trimmedText) || /^www\.[^\s]+$/i.test(trimmedText)) {
      handleNewClipboardItem(snap.text, 'url');
      lastImportedContentSignature = signature;
      return;
    }
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmedText)) {
      handleNewClipboardItem(snap.text, 'email');
      lastImportedContentSignature = signature;
      return;
    }
    if (isCodeContent(snap.text)) {
      handleNewClipboardItem(snap.text, 'code');
      lastImportedContentSignature = signature;
      return;
    }
  }

  if (snap.html && snap.html.trim().length > 0) {
    const strippedHtml = snap.html.replace(/<[^>]*>/g, '').trim();
    const isRichContent = snap.html.includes('<') && strippedHtml !== (snap.text || '').trim();
    if (isRichContent) {
      handleNewClipboardItem(snap.html, 'html');
      lastImportedContentSignature = signature;
      return;
    }
  }

  if (snap.text && snap.text.trim().length > 0) {
    handleNewClipboardItem(snap.text, 'text');
    lastImportedContentSignature = signature;
  }
}

/**
 * Metnin kod içeriği olup olmadığını gelişmiş regex ve analizle doğrular.
 */
function isCodeContent(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 5) return false;

  // 1. JSON (Sıkı veya Gevşek JS Nesneleri / Dizileri)
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    // Sıkı JSON testi
    try {
      JSON.parse(trimmed);
      return true;
    } catch (e) {}
    
    // Gevşek nesne/dizi kontrolü (ör. js nesnesi {a: 1, b: 'test'})
    if (/^\s*[\{\[]\s*(?:['"]?\w+['"]?\s*:\s*.+|['"]?\w+['"]?)\s*/m.test(trimmed)) {
      return true;
    }
  }

  // 2. HTML / XML / SVG Kontrolü (Tag tespiti)
  const htmlTagRegex = /<\/?[a-zA-Z][a-zA-Z0-9\-]*(\s+[a-zA-Z0-9\-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^>\s]+))?)*\s*\/?>/g;
  const matches = trimmed.match(htmlTagRegex);
  if (matches) {
    if (/<!DOCTYPE\s+html/i.test(trimmed) || 
        /<html/i.test(trimmed) || 
        /<head/i.test(trimmed) || 
        /<body/i.test(trimmed) || 
        /<script/i.test(trimmed) || 
        /<style/i.test(trimmed) || 
        /<svg/i.test(trimmed) || 
        /<\?xml/i.test(trimmed)) {
      return true;
    }
    if (matches.length >= 2) {
      return true;
    }
    const singleTagName = matches[0].replace(/[<\/>]/g, '').split(/\s+/)[0].toLowerCase();
    const commonTags = ['div', 'span', 'p', 'input', 'button', 'meta', 'link', 'style', 'script', 'iframe', 'canvas', 'section', 'header', 'footer', 'nav', 'aside', 'main', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'form', 'textarea', 'select', 'option', 'img', 'br', 'hr', 'xml', 'path', 'rect', 'circle', 'g'];
    if (commonTags.includes(singleTagName)) {
      return true;
    }
  }

  // 3. CSS / SASS / LESS Kontrolü
  if (/^[\.\#a-zA-Z0-9\-\s_,\+\>\:\*\[\]\(\)\=]+\s*\{\s*[^}]+\}/m.test(trimmed)) {
    if (/[\w\-]+\s*:\s*[^;\}]+;?/m.test(trimmed)) {
      return true;
    }
  }

  // 4. SQL Kontrolü
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|MERGE|WITH|REPLACE|UPSERT)\b/i.test(trimmed)) {
    return true;
  }

  // 5. Terminal / Bash / Powershell Paket Yöneticisi Komutları
  const terminalCommands = [
    /^\s*(npm|yarn|pnpm|npx)\s+(install|add|run|init|publish|remove|uninstall|update|dev|start|build)\b/,
    /^\s*git\s+(clone|pull|push|commit|add|status|checkout|branch|merge|rebase|init|remote|log|diff)\b/,
    /^\s*docker\s+(run|build|ps|images|stop|rm|rmi|exec|logs|compose|volume|network)\b/,
    /^\s*pip\s+(install|uninstall|list|show|freeze)\b/,
    /^\s*python3?\s+-m\s+/,
    /^\s*(apt-get|apt|yum|brew|choco|pacman)\s+(install|upgrade|update|remove|autoremove)\b/,
    /^\s*kubectl\s+(get|apply|delete|describe|logs|exec|port-forward)\b/,
    /^\s*gcloud\s+(auth|config|projects|compute|app|container)\b/,
    /^\s*aws\s+(s3|ec2|rds|lambda|iam|configure)\b/
  ];
  if (terminalCommands.some(pattern => pattern.test(trimmed))) {
    return true;
  }

  // 6. Kod Anahtar Kelimeleri & Programlama Yapıları
  const codeKeywords = [
    // JS/TS/C-Like
    /\b(const|let|var)\s+\w+\s*=/,
    /\b(function|class)\s+\w+\s*\(/,
    /\bconsole\.(log|error|warn|info|debug)\s*\(/,
    /\bimport\s+.*\s+from\s+['"]/,
    /\brequire\s*\(\s*['"]/,
    /\bmodule\.exports\s*=/,
    /\bexport\s+(const|let|var|class|function|default)\b/,
    /\b(public|private|protected|internal|static)\s+(class|void|string|int|double|float|bool|var|let|const)\b/,
    /\bsystem\.out\.print(ln)?\b/i,
    /\bnamespace\s+\w+\b/,
    /\busing\s+[\w\.]+;/,
    // Python
    /\bdef\s+\w+\s*\(.*\)\s*:/,
    /\bif\s+.*\s*:\s*\n/,
    /\bimport\s+\w+(\s+as\s+\w+)?\b/,
    /\bfrom\s+\w+\s+import\s+\w+\b/,
    // Go / Rust / PHP / Ruby
    /\bfunc\s+\w+\s*\(.*\)/,
    /\bpackage\s+\w+\b/,
    /\bfmt\.Print(ln|f)?\b/,
    /\bfn\s+\w+\s*\(.*\)\s*(->\s*\w+)?\s*\{/,
    /\blet\s+mut\s+\w+/,
    /<\?php\b/i,
    /\b(public|private|protected)\s+\$\w+\b/,
    // Genel programlama yapıları
    /if\s*\(.+\)\s*\{\s*$/m,
    /for\s*\(.+\)\s*\{\s*$/m,
    /while\s*\(.+\)\s*\{\s*$/m,
    /try\s*\{\s*$/m,
    /catch\s*\(.+\)\s*\{\s*$/m,
    /switch\s*\(.+\)\s*\{\s*$/m
  ];

  if (codeKeywords.some(pattern => pattern.test(trimmed))) {
    return true;
  }

  return false;
}

/**
 * Yeni clipboard öğesini işler ve DB'ye kaydeder.
 */
function handleNewClipboardItem(content, contentType) {

  // Otomatik içerik tipi algılama (Hem 'text' hem 'html' için)
  if (contentType === 'text' || contentType === 'html') {
    const plainText = contentType === 'html' ? content.replace(/<[^>]*>/g, '') : content;
    const trimmed = plainText.trim();
    // 1. URL Kontrolü
    if (/^https?:\/\/[^\s]+$/i.test(trimmed) || /^www\.[^\s]+$/i.test(trimmed)) {
      contentType = 'url';
      content = trimmed;
    }
    // 2. E-posta Kontrolü
    else if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
      contentType = 'email';
      content = trimmed;
    }
    // 3. Kod / HTML / CSS / SQL Kontrolü
    else if (isCodeContent(plainText)) {
      contentType = 'code';
      content = plainText;
    }
  }

  if (!db.isReady()) return;

  try {
    // Hassas veri algılama
    let isSensitive = 0;
    const detectSensitive = db.getSetting('detectSensitive');
    if (detectSensitive === 'true') {
      isSensitive = detectSensitiveContent(content) ? 1 : 0;
    }

    const item = db.addClipboardItem({
      content: content,
      content_type: contentType,
      is_sensitive: isSensitive,
      char_count: content.length,
    });

    if (mainWindow && !mainWindow.isDestroyed() && item) {
      mainWindow.webContents.send('clipboard-changed', item);
    }
  } catch (err) {
    console.error('Clipboard öğesi kaydetme hatası:', err);
  }
}

/**
 * Yeni görsel clipboard öğesini işler.
 * @param {Electron.NativeImage} image
 * @param {string} [precomputedHash]
 */
function handleNewImage(image, precomputedHash = '') {
  if (!db.isReady()) return;

  try {
    const imageHash = precomputedHash || hashImage(image);
    if (!imageHash) return;

    // Görseli dosyaya kaydet — DB ile aynı klasörü kullan (özel konum destekli)
    // content_hash ile mükerrer kontrolü addClipboardItem içinde yapılır
    const dbFile = db.getDbPath();
    const baseDir = activeDataDir || (dbFile ? path.dirname(dbFile) : app.getPath('userData'));
    const imagesDir = path.join(baseDir, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const filename = `clip_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.png`;
    const imagePath = path.join(imagesDir, filename);
    const pngBuffer = image.toPNG();
    fs.writeFileSync(imagePath, pngBuffer);

    const item = db.addClipboardItem({
      content: `[Görsel: ${formatBytes(pngBuffer.length)}]`,
      content_type: 'image',
      image_path: imagePath,
      content_hash: imageHash,
      char_count: 0,
    });

    // Duplicate by hash → existing row returned; remove unused new file
    if (item && item.image_path && item.image_path !== imagePath && fs.existsSync(imagePath)) {
      try { fs.unlinkSync(imagePath); } catch (_) { /* ignore */ }
    }

    if (mainWindow && !mainWindow.isDestroyed() && item) {
      mainWindow.webContents.send('clipboard-changed', item);
    }
  } catch (err) {
    console.error('Görsel kaydetme hatası:', err);
  }
}

/**
 * Görsel hash'ini hesaplar (değişiklik algılama için).
 * 32x32 yeniden boyutlandırma + gerçek boyut bilgisi — çakışma riskini minimize eder.
 */
function hashImage(image) {
  try {
    const size = image.getSize();
    const resized = image.resize({ width: 32, height: 32 });
    const buffer = resized.toBitmap();
    return crypto.createHash('md5')
      .update(buffer)
      .update(`${size.width}x${size.height}`)
      .digest('hex');
  } catch (err) {
    return '';
  }
}

/**
 * Hassas içerik algılama (kredi kartı, şifre vb.).
 */
function detectSensitiveContent(text) {
  if (!text || typeof text !== 'string' || text.length === 0) return false;
  
  // Performans açısından çok uzun metinlerin sadece ilk 10.000 karakterini tara
  const textToScan = text.length > 10000 ? text.substring(0, 10000) : text;

  const patterns = [
    // Kredi kartı (13-19 hane arası yaygın kredi kartı şemaları: Visa, MC, Amex, Troy vb.)
    /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9]{2})[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})\b/,
    // E-posta + şifre kombinasyonu veya anahtar kelimeler
    /\b(?:password|şifre|parola|passwd|secret)\s*[:=]\s*\S+/i,
    // API anahtarı veya Secret (AWS, Google, GitHub, Slack vb. yaygın formatlar)
    /\b(?:AIzaSy[A-Za-z0-9-_]{33}|ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{82}|xox[baprs]-[0-9a-zA-Z-]{10,48}|SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43})\b/i,
    // JWT token algılama (Format: header.payload.signature)
    /\beyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\b/,
    // Private key
    /-----BEGIN\s+(?:RSA\s+|EC\s+|PEM\s+)?PRIVATE\s+KEY-----/,
  ];

  // 1. Hızlı regex kontrolü
  if (patterns.some((pattern) => pattern.test(textToScan))) {
    return true;
  }

  // 2. T.C. Kimlik Numarası algılama ve checksum doğrulaması (Yanlış pozitifleri önler)
  const tcCandidates = textToScan.match(/\b[1-9]\d{10}\b/g);
  if (tcCandidates) {
    for (const tc of tcCandidates) {
      const digits = tc.split('').map(Number);
      const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
      const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
      const digit10 = (oddSum * 7 - evenSum) % 10;
      const totalSum = digits.slice(0, 10).reduce((sum, d) => sum + d, 0);
      if (digit10 === digits[9] && totalSum % 10 === digits[10]) {
        return true; // Geçerli checksum'a sahip T.C. Kimlik numarası bulundu!
      }
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════
// Global Kısayollar
// ═══════════════════════════════════════════════════════════════

function normalizeAccelerator(shortcut) {
  return String(shortcut || '').replace(/\s+/g, '').toLowerCase();
}

function validateAccelerator(nextShortcut, label) {
  const shortcut = requireString(nextShortcut, label, 60).trim();
  if (!/^(?=.*(?:Ctrl|Alt|Shift|Meta|Super)\+).+\+[^+]+$/i.test(shortcut)) {
    throw new Error(`${label} en az bir değiştirici ve bir ana tuş içermelidir.`);
  }
  const normalized = normalizeAccelerator(shortcut);
  const reserved = new Set([
    'ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+a', 'ctrl+z', 'ctrl+y', 'ctrl+f',
    'ctrl+1', 'ctrl+2', 'ctrl+shift+m', 'alt+f4', 'super+v', 'meta+v',
  ]);
  if (reserved.has(normalized)) {
    throw new Error('Bu kombinasyon sistem veya uygulama içinde kullanılan bir kısayolla çakışıyor.');
  }
  return shortcut;
}

function registerGlobalShortcuts() {
  try {
    let shortcut = 'Ctrl+Shift+V';
    let notesShortcut = 'Ctrl+Shift+N';
    if (db.isReady()) {
      const saved = db.getSetting('globalShortcut');
      if (saved) shortcut = saved;
      const savedNotes = db.getSetting('notesGlobalShortcut');
      if (savedNotes) notesShortcut = savedNotes;
    }

    const registered = globalShortcut.register(shortcut, () => {
      toggleWindow();
    });
    if (!registered) {
      console.warn(`Global kısayol kaydedilemedi: ${shortcut}`);
    }

    if (notesShortcut && normalizeAccelerator(notesShortcut) !== normalizeAccelerator(shortcut)) {
      const notesRegistered = globalShortcut.register(notesShortcut, () => {
        toggleNotesWindow();
      });
      if (!notesRegistered) {
        console.warn(`Notlar kısayolu kaydedilemedi: ${notesShortcut}`);
      }
    }
  } catch (err) {
    console.error('Global kısayol kayıt hatası:', err);
  }
}

/**
 * Opens (or toggles) the Notes workspace via global shortcut.
 */
function toggleNotesWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    applyWorkspaceMode('notes', true);
    showWindow();
    return;
  }

  if (Date.now() - lastBlurTime < 200) {
    return;
  }

  if (mainWindow.isVisible()) {
    const mode = db.isReady() ? (db.getSetting('workspaceMode') || 'clipboard') : 'clipboard';
    if (mode === 'notes') {
      hideWindow();
      return;
    }
    applyWorkspaceMode('notes', true);
    showWindow();
    return;
  }

  if (GetForegroundWindow) {
    const activeHwnd = GetForegroundWindow();
    if (isValidTargetWindow(activeHwnd)) {
      lastActiveWindowHwnd = activeHwnd;
    }
  }
  applyWorkspaceMode('notes', true);
  showWindow();
}

function updateGlobalShortcut(nextShortcut) {
  const shortcut = validateAccelerator(nextShortcut, 'Global kısayol');
  const notesShortcut = db.getSetting('notesGlobalShortcut') || 'Ctrl+Shift+N';
  if (normalizeAccelerator(shortcut) === normalizeAccelerator(notesShortcut)) {
    throw new Error('Pano ve Notlar kısayolları aynı olamaz.');
  }

  const previous = db.getSetting('globalShortcut') || 'Ctrl+Shift+V';
  if (shortcut === previous && globalShortcut.isRegistered(previous)) return shortcut;

  globalShortcut.unregister(previous);
  const registered = globalShortcut.register(shortcut, () => toggleWindow());
  if (!registered) {
    globalShortcut.register(previous, () => toggleWindow());
    throw new Error('Bu kısayol başka bir uygulama tarafından kullanılıyor. Önceki kısayol korundu.');
  }
  db.saveSetting('globalShortcut', shortcut);
  return shortcut;
}

function updateNotesGlobalShortcut(nextShortcut) {
  const shortcut = validateAccelerator(nextShortcut, 'Notlar kısayolu');
  const clipboardShortcut = db.getSetting('globalShortcut') || 'Ctrl+Shift+V';
  if (normalizeAccelerator(shortcut) === normalizeAccelerator(clipboardShortcut)) {
    throw new Error('Pano ve Notlar kısayolları aynı olamaz.');
  }

  const previous = db.getSetting('notesGlobalShortcut') || 'Ctrl+Shift+N';
  if (shortcut === previous && globalShortcut.isRegistered(previous)) return shortcut;

  if (previous) globalShortcut.unregister(previous);
  const registered = globalShortcut.register(shortcut, () => toggleNotesWindow());
  if (!registered) {
    if (previous) globalShortcut.register(previous, () => toggleNotesWindow());
    throw new Error('Bu kısayol başka bir uygulama tarafından kullanılıyor. Önceki kısayol korundu.');
  }
  db.saveSetting('notesGlobalShortcut', shortcut);
  return shortcut;
}

function isRunningAsAdministrator() {
  if (process.platform !== 'win32' || !IsUserAnAdmin) return false;
  try {
    return !!IsUserAnAdmin();
  } catch {
    return false;
  }
}

function relaunchAsAdministrator() {
  if (process.platform !== 'win32') {
    throw new Error('Yönetici modu yalnızca Windows üzerinde kullanılabilir.');
  }
  if (isRunningAsAdministrator()) return { alreadyElevated: true };
  if (!app.isPackaged) {
    throw new Error('Yönetici olarak yeniden başlatma paketlenmiş uygulamada kullanılabilir.');
  }

  const exePath = getApplicationExePath();
  const escapedPath = exePath.replace(/'/g, "''");
  const command = `Start-Process -FilePath '${escapedPath}' -Verb RunAs`;
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true },
    (error) => {
      if (error) {
        console.error('Yönetici olarak yeniden başlatma başarısız:', error);
        return;
      }
      isQuitting = true;
      app.quit();
    }
  );
  return { requested: true };
}

// ═══════════════════════════════════════════════════════════════
// IPC Handlers
// ═══════════════════════════════════════════════════════════════

function registerIPCHandlers() {
  ipcMain.handle('get-app-info', async () => {
    try {
      return {
        success: true,
        data: {
          name: 'ClipBoardPrime',
          version: app.getVersion(),
          isDev: isDev,
          isPortable: isPortable,
          author: 'Maximus Prime',
        }
      };
    } catch (err) {
      console.error('get-app-info hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('reveal-sensitive-content', async (_event, id) => {
    try {
      id = requirePositiveInteger(id);
      if (!db.isReady()) {
        return { success: false, error: 'Veritabanı hazır değil' };
      }
      const item = db.getClipboardItemById(id);
      if (!item) {
        return { success: false, error: 'Öğe bulunamadı' };
      }
      return { success: true, data: item.content };
    } catch (err) {
      console.error('reveal-sensitive-content hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cleanup-orphan-images', async () => {
    try {
      if (db.isReady()) {
        await runDatabaseTask('cleanupOrphanImages');
        return { success: true };
      }
      return { success: false, error: 'Veritabanı hazır değil' };
    } catch (err) {
      console.error('cleanup-orphan-images hatası:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Clipboard ────────────────────────────────────────────────

  ipcMain.handle('get-clipboard-history', async (_event, params) => {
    try {
      return { success: true, data: db.getClipboardHistory(params) };
    } catch (err) {
      console.error('get-clipboard-history hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-clipboard-item', async (_event, id) => {
    try {
      id = requirePositiveInteger(id);
      const result = db.deleteClipboardItem(id);
      // OS panosu hâlâ aynı içeriği tutuyor olabilir — yeniden kaydetme
      markOsClipboardAsKnown();
      return { success: true, data: result };
    } catch (err) {
      console.error('delete-clipboard-item hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-clipboard-items-batch', async (_event, ids) => {
    try {
      if (!Array.isArray(ids)) {
        return { success: false, error: 'Geçersiz id listesi' };
      }
      const validIds = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
      const deletedCount = db.deleteClipboardItemsBatch(validIds);
      markOsClipboardAsKnown();
      return { success: true, data: { deleted: deletedCount } };
    } catch (err) {
      console.error('delete-clipboard-items-batch hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('clear-clipboard-history', async () => {
    try {
      const count = db.clearHistory();
      // OS panosu hâlâ aynı içeriği tutuyor olabilir — yeniden kaydetme
      markOsClipboardAsKnown();
      return { success: true, data: { deleted: count } };
    } catch (err) {
      console.error('clear-clipboard-history hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('toggle-pin-clipboard', async (_event, id) => {
    try {
      id = requirePositiveInteger(id);
      const item = db.togglePin(id);
      return { success: true, data: item };
    } catch (err) {
      console.error('toggle-pin-clipboard hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('toggle-favorite-clipboard', async (_event, id) => {
    try {
      id = requirePositiveInteger(id);
      const item = db.toggleFavorite(id);
      return { success: true, data: item };
    } catch (err) {
      console.error('toggle-favorite-clipboard hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('copy-to-clipboard', async (_event, payload) => {
    isWritingToClipboard = true;
    try {
      if (!payload || typeof payload !== 'object') throw new Error('Geçersiz pano isteği.');
      let { id, content, type, ignoreChange = true, plainText = false } = payload;
      id = id ? requirePositiveInteger(id) : null;
      ignoreChange = requireBoolean(ignoreChange, 'Değişikliği yok say');
      plainText = requireBoolean(plainText, 'Düz metin');
      let actualContent = content;
      if (id) {
        const item = db.getClipboardItemById(id);
        if (item) {
          actualContent = item.content;
          type = item.content_type;
        }
      }
      actualContent = requireString(actualContent, 'Pano içeriği', 10_000_000);
      type = requireString(type || 'text', 'İçerik türü', 20);
      if (!['text', 'html', 'url', 'email', 'code', 'image'].includes(type)) {
        throw new Error('Desteklenmeyen pano içerik türü.');
      }

      if (type === 'image') {
        // Görsel dosyasını oku ve clipboard'a yaz
        if (fs.existsSync(actualContent)) {
          const img = nativeImage.createFromPath(actualContent);
          clipboard.writeImage(img);
        } else {
          return { success: false, error: 'Görsel dosyası bulunamadı' };
        }
      } else if (type === 'html' && !plainText) {
        clipboard.writeHTML(actualContent);
        // Metin olarak da yaz ki düz metin yapıştırma çalışsın
        const plainContent = htmlToPlainText(actualContent);
        clipboard.write({
          text: plainContent,
          html: actualContent,
        });
      } else {
        clipboard.writeText(type === 'html' ? htmlToPlainText(actualContent) : actualContent);
      }

      if (!ignoreChange) {
        if (type === 'image') {
          const isExistingDbImage = actualContent && actualContent.includes('images') && fs.existsSync(actualContent);
          if (isExistingDbImage) {
            try {
              const item = db.addClipboardItem({
                content: `[Görsel]`,
                content_type: 'image',
                image_path: actualContent,
                char_count: 0,
              });
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('clipboard-changed', item);
              }
            } catch (err) {
              console.error('Görsel güncelleme hatası:', err);
            }
          } else {
            if (fs.existsSync(actualContent)) {
              const img = nativeImage.createFromPath(actualContent);
              handleNewImage(img);
            }
          }
        } else {
          handleNewClipboardItem(actualContent, type || 'text');
        }
      }

      // Yeni değerleri sakla (sonraki karşılaştırma için)
      updateLastClipboardState();

      return { success: true };
    } catch (err) {
      console.error('copy-to-clipboard hatası:', err);
      return { success: false, error: err.message };
    } finally {
      setTimeout(() => {
        isWritingToClipboard = false;
      }, 50);
    }
  });

  ipcMain.handle('clip-to-note', async (_event, id) => {
    try {
      id = requirePositiveInteger(id);
      const clipItem = db.getClipboardItemById(id);
      if (!clipItem) {
        return { success: false, error: 'Clipboard öğesi bulunamadı' };
      }

      let noteContent = clipItem.content || '';
      if (clipItem.content_type === 'html') {
        // Ham HTML etiketlerini, yorumlarını, style ve script bloklarını temizle
        noteContent = noteContent
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'")
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .trim();
      }

      const note = db.addNote({
        title: clipItem.preview
          ? clipItem.preview.substring(0, 50)
          : 'Panodan Not',
        content: noteContent,
        color: '#3b82f6',
      });

      return { success: true, data: note };
    } catch (err) {
      console.error('clip-to-note hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('update-clipboard-item', async (_event, params) => {
    try {
      if (!db.isReady()) {
        return { success: false, error: 'Veritabanı hazır değil' };
      }
      if (!params || typeof params !== 'object') throw new Error('Geçersiz güncelleme isteği.');
      const id = requirePositiveInteger(params.id);
      const content = requireString(params.content, 'İçerik', 10_000_000);
      const updated = db.updateClipboardItem(id, content);
      return { success: true, data: updated };
    } catch (err) {
      console.error('update-clipboard-item hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('paste-to-active-window', async (_event, params) => {
    let id, content, plainText = false, type = 'text';
    if (params && typeof params === 'object') {
      id = params.id;
      content = params.content;
      plainText = params.plainText === true;
      type = params.type || type;
    } else {
      content = params;
    }
    id = id ? requirePositiveInteger(id) : null;
    isWritingToClipboard = true;
    try {
      let actualContent = content;
      if (id) {
        const item = db.getClipboardItemById(id);
        if (item) {
          actualContent = item.content;
          type = item.content_type;
        }
      }
      actualContent = requireString(actualContent, 'Yapıştırılacak içerik', 10_000_000);
      type = requireString(type, 'İçerik türü', 20);

      const databaseContent = type === 'html' && plainText
        ? htmlToPlainText(actualContent)
        : actualContent;
      if (type === 'html' && !plainText) {
        clipboard.write({
          text: htmlToPlainText(actualContent),
          html: actualContent,
        });
      } else {
        clipboard.writeText(databaseContent);
      }

      // Clipboard değerlerini güncelle (paste geçmişe yeni kayıt yazmaz)
      updateLastClipboardState();

      // Bilinen bir geçmiş öğesi yapıştırıldıysa yalnızca "son kullanım" zamanını güncelle
      if (id && db.isReady()) {
        try {
          const touched = typeof db.touchClipboardItem === 'function'
            ? db.touchClipboardItem(id)
            : null;
          if (touched && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('clipboard-changed', touched);
          }
        } catch (dbErr) {
          console.error('Yapıştırma sonrası öğe zamanı güncellenemedi:', dbErr);
        }
      }

      if (SendInput && INPUT) {
        // Yapıştırma boyunca hedefin blur/timer olayları tarafından değişmesini önle.
        const pasteTargetHwnd = lastActiveWindowHwnd;

        // 1. Önce hedef pencereyi öne getir (ClipBoardPrime hala odaktayken bu yetkiye sahiptir)
        if (pasteTargetHwnd && SetForegroundWindow) {
          SetForegroundWindow(pasteTargetHwnd);
        }

        // 2. Kısa bir süre bekleyip odağın geçişini sağla, ardından ClipBoardPrime'ı gizle
        return await new Promise((resolve) => setTimeout(async () => {
          try {
            if (mainWindow && !mainWindow.isDestroyed() && db.getSetting('hideAfterPaste') !== 'false') {
              mainWindow.hide();
            }

            // 3. Pencere gizlendikten sonra odağın tamamen oturması için asenkron gecikme
            await new Promise(resolve => setTimeout(resolve, 100));

            // Electron gizlenirken Windows odağı başka bir pencereye verebilir.
            // Sabitlenen hedefi gizleme sonrasında yeniden öne getir.
            if (pasteTargetHwnd && SetForegroundWindow) {
              SetForegroundWindow(pasteTargetHwnd);
              await new Promise(resolve => setTimeout(resolve, 80));
            }

            // Sanal klavye kodları ve modifikatörler
            const VK_SHIFT = 0x10;
            const VK_CONTROL = 0x11;
            const VK_MENU = 0x12;
            const VK_LWIN = 0x5B;
            const VK_RWIN = 0x5C;
            const VK_LCONTROL = 0xA2;
            const VK_V = 0x56;
            const KEYEVENTF_KEYUP = 0x0002;

            // 1. Modifikatörleri serbest bırak (Ctrl, Shift, Alt, Win)
            const releaseInputs = [
              { type: 1, u: { ki: { wVk: VK_LCONTROL, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } },
              { type: 1, u: { ki: { wVk: VK_CONTROL, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } },
              { type: 1, u: { ki: { wVk: VK_SHIFT, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } },
              { type: 1, u: { ki: { wVk: VK_MENU, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } },
              { type: 1, u: { ki: { wVk: VK_LWIN, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } },
              { type: 1, u: { ki: { wVk: VK_RWIN, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } }
            ];
            SendInput(releaseInputs.length, releaseInputs, koffi.sizeof(INPUT));

            await new Promise(resolve => setTimeout(resolve, 20));

            // 2. Ctrl Down + V Down + V Up + Ctrl Up (Aynı paket içinde sanal tuş kodlarıyla)
            const pasteInputs = [
              { type: 1, u: { ki: { wVk: VK_LCONTROL, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0 } } },
              { type: 1, u: { ki: { wVk: VK_V, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0 } } },
              { type: 1, u: { ki: { wVk: VK_V, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } },
              { type: 1, u: { ki: { wVk: VK_LCONTROL, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } }
            ];
            const res = SendInput(pasteInputs.length, pasteInputs, koffi.sizeof(INPUT));
            if (res !== pasteInputs.length) {
              const errorCode = GetLastError ? GetLastError() : 0;
              throw new Error(`Windows yapıştırma komutu tamamlanamadı (kod: ${errorCode}).`);
            }
            resolve({ success: true });
          } catch (sendErr) {
            console.error('SendInput yapıştırma hatası:', sendErr);
            // Native giriş engellenirse çalışan eski yönteme otomatik geç.
            const fallbackResult = await sendPasteWithMshta();
            resolve(fallbackResult.success
              ? fallbackResult
              : { success: false, error: `${sendErr.message}; ${fallbackResult.error}` });
          } finally {
            // isWritingToClipboard bayrağını klavye simülasyonu sonrasında kaldır
            setTimeout(() => {
              isWritingToClipboard = false;
            }, 50);
          }
        }, 150));
      } else {
        // Fallback: mshta yöntemi (koffi yüklenemezse yedek olarak çalışır)
        // Aktif pencereye yapıştırmak için ClipBoardPrime'ın odağı kaybetmesi (gizlenmesi) şarttır.
        if (mainWindow && !mainWindow.isDestroyed() && db.getSetting('hideAfterPaste') !== 'false') {
          mainWindow.hide();
        }
        await new Promise(resolve => setTimeout(resolve, 150));
        const fallbackResult = await sendPasteWithMshta();
        isWritingToClipboard = false;
        return fallbackResult;
      }
    } catch (err) {
      console.error('paste-to-active-window hatası:', err);
      isWritingToClipboard = false;
      return { success: false, error: err.message };
    }
  });

  // ── Notes ────────────────────────────────────────────────────

  ipcMain.handle('get-notes', async (_event, params) => {
    try {
      const notes = db.getNotes(params);
      return { success: true, data: notes };
    } catch (err) {
      console.error('get-notes hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-note', async (_event, note) => {
    try {
      if (!note || typeof note !== 'object') throw new Error('Geçersiz not verisi.');
      note = {
        ...note,
        id: note.id ? requirePositiveInteger(note.id, 'Not kimliği') : undefined,
        title: requireString(note.title || '', 'Not başlığı', 500),
        content: requireString(note.content || '', 'Not içeriği', 10_000_000),
        category_id: requirePositiveInteger(
          note.category_id || db.getDefaultCategoryId(),
          'Kategori kimliği'
        ),
      };
      let result;
      if (note.id) {
        result = db.updateNote(note);
      } else {
        result = db.addNote(note);
      }
      return { success: true, data: result };
    } catch (err) {
      console.error('save-note hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-note', async (_event, id) => {
    try {
      id = requirePositiveInteger(id, 'Not kimliği');
      const result = db.deleteNote(id);
      return { success: true, data: result };
    } catch (err) {
      console.error('delete-note hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('toggle-favorite-note', async (_event, id) => {
    try {
      id = requirePositiveInteger(id, 'Not kimliği');
      const note = db.toggleFavoriteNote(id);
      return { success: true, data: note };
    } catch (err) {
      console.error('toggle-favorite-note hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('toggle-pin-note', async (_event, id) => {
    try {
      id = requirePositiveInteger(id, 'Not kimliği');
      const note = db.togglePinNote(id);
      return { success: true, data: note };
    } catch (err) {
      console.error('toggle-pin-note hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('update-note-date', async (_event, id, newDateStr) => {
    try {
      id = requirePositiveInteger(id, 'Not kimliği');
      newDateStr = requireDateString(newDateStr, 'Not tarihi');
      const result = db.updateNoteDate(id, newDateStr);
      return { success: true, data: result };
    } catch (err) {
      console.error('update-note-date hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('reorder-notes', async (_event, orderedIds) => {
    try {
      orderedIds = requireIdOrderList(orderedIds);
      db.reorderNotes(orderedIds);
      return { success: true };
    } catch (err) {
      console.error('reorder-notes hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('reorder-categories', async (_event, orderedIds) => {
    try {
      orderedIds = requireIdOrderList(orderedIds);
      db.reorderCategories(orderedIds);
      return { success: true };
    } catch (err) {
      console.error('reorder-categories hatası:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Categories ───────────────────────────────────────────────

  ipcMain.handle('get-categories', async () => {
    try {
      const categories = db.getCategories();
      return { success: true, data: categories };
    } catch (err) {
      console.error('get-categories hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-category', async (_event, cat) => {
    try {
      if (!cat || typeof cat !== 'object') throw new Error('Geçersiz kategori verisi.');
      cat = {
        ...cat,
        id: cat.id ? requirePositiveInteger(cat.id, 'Kategori kimliği') : undefined,
        name: requireString(cat.name || '', 'Kategori adı', 100).trim(),
        color: requireHexColor(cat.color || '#6366f1', 'Kategori rengi'),
        icon: requireCategoryIcon(cat.icon),
      };
      if (!cat.name) throw new Error('Kategori adı boş olamaz.');
      let result;
      if (cat.id) {
        result = db.updateCategory(cat);
      } else {
        result = db.addCategory(cat);
      }
      return { success: true, data: result };
    } catch (err) {
      console.error('save-category hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-category', async (_event, id) => {
    try {
      id = requirePositiveInteger(id, 'Kategori kimliği');
      const result = db.deleteCategory(id);
      return { success: true, data: result };
    } catch (err) {
      console.error('delete-category hatası:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Settings ─────────────────────────────────────────────────

  ipcMain.handle('get-settings', async () => {
    try {
      const settings = db.getAllSettings();
      return { success: true, data: settings };
    } catch (err) {
      console.error('get-settings hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-setting', async (_event, payload) => {
    try {
      if (!payload || typeof payload !== 'object') throw new Error('Geçersiz ayar verisi.');
      const { key, value } = validateSetting(payload.key, payload.value);
      if (key === 'globalShortcut') {
        const shortcut = updateGlobalShortcut(value);
        mainWindow?.webContents.send('settings-changed', { key, value: shortcut });
        return { success: true, data: shortcut };
      }
      if (key === 'notesGlobalShortcut') {
        const shortcut = updateNotesGlobalShortcut(value);
        mainWindow?.webContents.send('settings-changed', { key, value: shortcut });
        return { success: true, data: shortcut };
      }
      const result = db.saveSetting(key, value);

      // Belirli ayarlar değişince anlık tepki ver
      handleSettingChange(key, value);

      // Renderer'a bildir
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings-changed', { key, value });
      }

      return { success: true, data: result };
    } catch (err) {
      console.error('save-setting hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('select-data-location', async () => {
    if (isPortable) {
      return { success: false, error: 'Taşınabilir modda veri konumu değiştirilemez.' };
    }
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: getTranslation('nativeDialog.selectDataLocationTitle'),
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: getTranslation('nativeDialog.selectFolderButton'),
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'İptal edildi' };
      }

      const newLocation = result.filePaths[0];
      db.changeLocation(newLocation, app.getPath('userData'));
      // config.json'a da kaydet ki yeniden başlatmada doğru konum okunabilsin
      saveCustomDataLocation(newLocation);
      // Anlık olarak activeDataDir'i de güncelle — yeniden başlatma beklenmeden görseller doğru yere gider
      activeDataDir = newLocation;

      return { success: true, data: { path: newLocation } };
    } catch (err) {
      console.error('select-data-location hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export-data', async (_event, options = {}) => {
    try {
      const password = requireString(options.password, 'Yedek parolası', 1024);
      const result = await dialog.showSaveDialog(mainWindow, {
        title: getTranslation('nativeDialog.exportBackupTitle'),
        defaultPath: `clipboard-prime-backup-${formatDate(new Date())}.cpbackup`,
        filters: [
          { name: getTranslation('nativeDialog.encryptedBackupFilter'), extensions: ['cpbackup'] },
        ],
        buttonLabel: getTranslation('nativeDialog.exportButton'),
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'İptal edildi' };
      }

      const exportResult = await runDatabaseTask('exportBackup', {
        filePath: result.filePath,
        password,
      });
      return { success: true, data: exportResult };
    } catch (err) {
      console.error('export-data hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('import-data', async (_event, options = {}) => {
    try {
      const password = String(options.password || '');
      if (password.length > 1024) throw new Error('Yedek parolası çok uzun.');
      const result = await dialog.showOpenDialog(mainWindow, {
        title: getTranslation('nativeDialog.importBackupTitle'),
        filters: [
          { name: getTranslation('nativeDialog.backupsFilter'), extensions: ['cpbackup', 'json'] },
        ],
        properties: ['openFile'],
        buttonLabel: getTranslation('nativeDialog.importButton'),
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'İptal edildi' };
      }

      const importResult = await runDatabaseTask('importBackup', {
        filePath: result.filePaths[0],
        password,
      });
      return { success: true, data: importResult };
    } catch (err) {
      console.error('import-data hatası:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Stats ────────────────────────────────────────────────────

  ipcMain.handle('get-stats', async () => {
    try {
      const stats = await runDatabaseTask('getStats');
      return { success: true, data: stats };
    } catch (err) {
      console.error('get-stats hatası:', err);
      return { success: false, error: err.message };
    }
  });

  // ── open-external ────────────────────────────────────────────

  ipcMain.handle('open-external', async (_event, url) => {
    try {
      await shell.openExternal(validateExternalUrl(url));
      return { success: true };
    } catch (err) {
      console.error('open-external hatası:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Modal Durum Bildirimi ─────────────────────────────────────
  // Renderer, modal açıkken blur→hide engellenmesi için bunu bildirir
  ipcMain.handle('set-modal-open', async (_event, value) => {
    if (typeof value !== 'boolean') {
      return { success: false, error: 'Modal durumu doğru/yanlış olmalıdır.' };
    }
    isModalOpen = value;
    if (value) modalProtectionUntil = Date.now() + 500;
    return { success: true };
  });

  ipcMain.handle('find-legacy-backups', async () => {
    try {
      return { success: true, data: findLegacyBackups() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('import-detected-backup', async (_event, options = {}) => {
    try {
      const filePath = validateDetectedBackupPath(options.filePath);
      const password = String(options.password || '');
      if (password.length > 1024) throw new Error('Yedek parolası çok uzun.');
      const data = await runDatabaseTask('importBackup', { filePath, password });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('show-clipboard-context-menu', async (_event, payload) => {
    try {
      if (!payload || typeof payload !== 'object') throw new Error('Geçersiz menü isteği.');
      const id = requirePositiveInteger(payload.id);
      const type = requireString(payload.type, 'İçerik türü', 20);
      const isPinned = requireBoolean(payload.isPinned, 'Sabit durumu');
      const isFavorite = requireBoolean(payload.isFavorite, 'Favori durumu');
      const labels = getClipboardMenuLabels();
      const sendAction = (action) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('clipboard-context-action', { action, id });
        }
      };
      const template = [];

      if (type !== 'image') {
        template.push(
          { label: labels.paste, click: () => sendAction('paste') },
          { label: labels.pastePlain, click: () => sendAction('pastePlain') },
        );
      }
      template.push(
        { label: labels.copy, click: () => sendAction('copy') },
        ...(type === 'html' ? [{ label: labels.copyPlain, click: () => sendAction('copyPlain') }] : []),
        { type: 'separator' },
        { label: isPinned ? labels.unpin : labels.pin, click: () => sendAction('pin') },
        { label: isFavorite ? labels.unfavorite : labels.favorite, click: () => sendAction('favorite') },
        { label: labels.note, enabled: type !== 'image', click: () => sendAction('note') },
        { label: labels.details, click: () => sendAction('details') },
        { type: 'separator' },
        { label: labels.delete, click: () => sendAction('delete') },
      );

      Menu.buildFromTemplate(template).popup({ window: mainWindow });
      return { success: true };
    } catch (err) {
      console.error('show-clipboard-context-menu hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('set-workspace-mode', async (_event, mode) => {
    try {
      mode = requireString(mode, 'Çalışma alanı modu', 20);
      if (!WORKSPACE_MODES.includes(mode)) {
        throw new Error('Desteklenmeyen çalışma alanı modu.');
      }
      applyWorkspaceMode(mode);
      return { success: true, data: { mode } };
    } catch (err) {
      console.error('set-workspace-mode hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('reset-window-bounds', async () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Uygulama penceresi hazır değil.');
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      const current = mainWindow.getBounds();
      const display = screen.getDisplayMatching(current);
      const area = display.workArea;
      const width = Math.min(540, area.width);
      const height = Math.min(640, area.height);
      const bounds = constrainBoundsToDisplay({
        width,
        height,
        x: area.x + Math.round((area.width - width) / 2),
        y: area.y + Math.round((area.height - height) / 2),
      });
      mainWindow.setBounds(bounds, true);
      db.saveSetting(workspaceBoundsKey(), JSON.stringify(bounds));
      return { success: true, data: bounds };
    } catch (err) {
      console.error('reset-window-bounds hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-privilege-status', async () => ({
    success: true,
    data: {
      isAdministrator: isRunningAsAdministrator(),
      canRelaunch: process.platform === 'win32' && app.isPackaged,
    },
  }));

  ipcMain.handle('relaunch-as-administrator', async () => {
    try {
      return { success: true, data: relaunchAsAdministrator() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Ayar Değişikliği İşleme
// ═══════════════════════════════════════════════════════════════

function handleSettingChange(key, value) {
  switch (key) {
    case 'pollingInterval':
      // Clipboard izleme aralığını güncelle
      stopClipboardWatcher();
      startClipboardWatcher();
      break;

    case 'startWithWindows':
      // Başlangıçta aç ayarını güncelle
      setWindowsAutostart(value === 'true');
      break;

    case 'language':
      // Sistem tepsisi dilini güncelle
      updateTrayMenu();
      break;
    case 'retentionDays':
    case 'retentionKeepFavorites':
    case 'retentionTypeRules':
      runHistoryCleanup();
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// Yardımcı Fonksiyonlar
// ═══════════════════════════════════════════════════════════════

/**
 * Debounce fonksiyonu.
 */
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Tarihi YYYY-MM-DD formatında döner.
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
// Uygulama Yaşam Döngüsü
// ═══════════════════════════════════════════════════════════════

// İkinci instance açılınca mevcut pencereyi göster
app.on('second-instance', () => {
  showWindow();
});

app.whenReady().then(() => {
  // Varsayılan üst menü çubuğunu (File, Edit, View vb.) kaldırır
  Menu.setApplicationMenu(null);

  try {
    encryptionKey = getOrCreateEncryptionKey();
  } catch (err) {
    console.error('Şifreleme anahtarı başlatılamadı:', err);
    dialog.showErrorBox(
      'Güvenli Depolama Hatası',
      `Şifreleme anahtarı güvenli şekilde açılamadı: ${err.message}\nUygulama kapatılacak.`
    );
    app.quit();
    return;
  }

  // local-file protokolünü tanımla (yerel görselleri güvenle yüklemek için)
  protocol.handle('local-file', async (request) => {
    try {
      let urlPath = request.url.replace('local-file:///', '');
      if (request.url.startsWith('local-file://') && !request.url.startsWith('local-file:///')) {
        urlPath = request.url.replace('local-file://', '');
      }
      
      const decodedPath = path.normalize(decodeURIComponent(urlPath));
      
      // Güvenlik sınır kontrolü: Sadece activeDataDir altındaki resimlerin okunmasına izin ver
      const dbFile = db.getDbPath();
      const baseDir = activeDataDir || (dbFile ? path.dirname(dbFile) : app.getPath('userData'));
      const allowedDir = path.join(baseDir, 'images');

      const relative = path.relative(allowedDir, decodedPath);
      const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

      if (!isSafe) {
        return new Response('Erişim Engellendi (Güvenlik Sınırı Dışı)', { status: 403 });
      }

      if (fs.existsSync(decodedPath)) {
        // Dosya uzantısından MIME tipini belirle
        const ext = path.extname(decodedPath).toLowerCase();
        const mimeTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.bmp': 'image/bmp',
          '.ico': 'image/x-icon',
        };
        const contentType = mimeTypes[ext];
        if (!contentType) {
          return new Response('Desteklenmeyen görsel biçimi', { status: 415 });
        }
        const data = await fs.promises.readFile(decodedPath);
        return new Response(data, {
          headers: {
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, max-age=300',
          }
        });
      } else {
        return new Response('Dosya bulunamadı', { status: 404 });
      }
    } catch (err) {
      console.error('local-file protokol hatası:', err);
      return new Response('Hata: ' + err.message, { status: 500 });
    }
  });

  try {
    // Veritabanını başlat
    const dbOptions = {
      encrypt: encryptText,
      decrypt: decryptText,
      fingerprint: fingerprintText,
    };

    // config.json'dan özel veri konumunu oku (DB'den bağımsız, kalıcı)
    const savedCustomLocation = isPortable ? '' : getCustomDataLocation();
    const effectiveLocation = savedCustomLocation || app.getPath('userData');

    let dbFallbackUsed = false;
    try {
      db.initialize(effectiveLocation, '', dbOptions);
      activeDataDir = effectiveLocation; // ✅ gerçek konum kaydedildi
    } catch (err) {
      console.error('Veri konumunda DB açılamadı, varsayılan kullanılıyor:', err);
      db.initialize(app.getPath('userData'), '', dbOptions);
      activeDataDir = app.getPath('userData'); // fallback konum
      dbFallbackUsed = savedCustomLocation ? true : false; // özel konum varken düşüyorsa uyar
      if (dbFallbackUsed) {
        // Pencere hazır olmadan dialog.showErrorBox kullanabiliyoruz (native dialog)
        dialog.showErrorBox(
          'Veri Konumu Hatası',
          `Seçili veri konumu açılamadı:\n${savedCustomLocation}\n\nVeriler geçici olarak varsayılan konuma (AppData) kaydedilecek.\nLütfen Ayarlar > Veri Konumu bölümünden konumu yeniden seçin.`
        );
      }
    }

    // Tray balonu daha önce gösterilmişse tekrar gösterme
    const savedBalloonShown = db.getSetting('trayBalloonShown');
    if (savedBalloonShown === 'true') {
      trayBalloonShown = true;
    }

    // ── Varsayılan ayarları ilk çalıştırmada kaydet ───────────
    // startWithWindows daha önce hiç kaydedilmemişse true olarak ayarla
    const existingAutostart = db.getSetting('startWithWindows');
    if (existingAutostart === null || existingAutostart === undefined || existingAutostart === '') {
      db.saveSetting('startWithWindows', 'true');
    }

    // Başlangıçta aç ayarını veritabanından oku ve uygula
    const startWithWindows = db.getSetting('startWithWindows') !== 'false';
    if (!isE2E) setWindowsAutostart(startWithWindows);

    // Yetim görsel dosyalarını temizle
    db.cleanupOrphanImages();

  } catch (err) {
    console.error('Veritabanı başlatma hatası:', err);
    dialog.showErrorBox(
      'Veritabanı Hatası',
      `Veritabanı başlatılamadı: ${err.message}\nUygulama kapatılacak.`
    );
    app.quit();
    return;
  }

  // Renderer yüklenmeye başlamadan önce bütün IPC handler'larını hazırla.
  // Aksi halde hızlı sistemlerde ilk get-settings çağrısı handlersız kalıp
  // renderer başlangıcını yarıda kesebilir ve pencere boş görünebilir.
  registerIPCHandlers();

  // Pencereyi oluştur
  createWindow();

  // System tray oluştur
  if (!isE2E) createTray();

  // Global kısayolları kaydet
  if (!isE2E) registerGlobalShortcuts();

  // Clipboard izlemeyi başlat
  if (!isE2E) {
    startClipboardWatcher();
    startHistoryCleanupTimer();
  }
});

// macOS'ta tüm pencereler kapatılınca uygulamayı kapatma
app.on('window-all-closed', () => {
  // macOS dışında da kapatma — tray'de devam et
  // Sadece isQuitting true ise kapat
});

app.on('activate', () => {
  // macOS'ta dock ikonuna tıklayınca pencereyi göster
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    showWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  // Kaynakları temizle
  globalShortcut.unregisterAll();
  stopClipboardWatcher();
  if (historyCleanupTimer) clearInterval(historyCleanupTimer);
  db.close();

  // Tray'i temizle
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

// Beklenmeyen hataları yakala
function handleFatalProcessError(label, error) {
  console.error(label, error);
  if (fatalErrorInProgress) return;
  fatalErrorInProgress = true;
  isQuitting = true;
  const message = error instanceof Error ? error.message : String(error);
  try {
    dialog.showErrorBox(
      'ClipBoardPrime Kritik Hata',
      `Uygulama güvenli olmayan bir duruma girdi ve kapatılacak.\n\n${message}`
    );
  } catch {}
  app.exit(1);
}

process.on('uncaughtException', (err) => {
  handleFatalProcessError('Yakalanmamış hata:', err);
});

process.on('unhandledRejection', (reason) => {
  handleFatalProcessError('İşlenmemiş Promise hatası:', reason);
});
