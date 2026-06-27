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
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec, execFile } = require('child_process');

// Geliştirme modu ve Portable mod tespiti
const isDev = process.argv.includes('--dev');
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;

// Taşınabilir (Portable) veya Geliştirme moduna göre userData dizini ata
if (isPortable) {
  const portableDataPath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');
  app.setPath('userData', portableDataPath);
} else if (isDev) {
  const devDataPath = path.join(app.getPath('appData'), 'clipboard-pro-app-dev');
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

  if (!config.encryptionKey) {
    config.encryptionKey = crypto.randomBytes(32).toString('hex');
    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (err) {
      console.error('Konfigürasyon dosyası yazılamadı:', err);
    }
  }
  return config.encryptionKey;
}

const encryptionKey = getOrCreateEncryptionKey();
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

/**
 * Metni AES-256-GCM ile şifreler.
 */
function encryptText(text, deterministic = false) {
  if (!text) return '';
  try {
    let iv;
    if (deterministic) {
      // İçeriğin hash'inden 12 byte IV üret (deterministik şifreleme ve mükerrerlik tespiti için)
      const hash = crypto.createHash('sha256').update(text).digest();
      iv = hash.slice(0, 12);
    } else {
      iv = crypto.randomBytes(12);
    }
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
let isQuitting = false;
let lastClipboardText = '';
let lastClipboardHtml = '';
let lastClipboardImageHash = '';
let lastFormats = [];
let lastImageSize = { width: 0, height: 0 };
let trayBalloonShown = false;
// DB'nin gerçekte başlatıldığı dizin (effectiveLocation ile senkronize tutulur)
// handleNewImage ve benzeri fonksiyonlar bunu kullanır — getDbPath() null kalsa da güvende oluruz.
let activeDataDir = null;
let isModalOpen = false;
let lastBlurTime = 0;
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

let helperExePath = null;

/**
 * Windows aktif pencere tespit aracını derler.
 */
function compileActiveWinHelper() {
  const userData = app.getPath('userData');
  const csPath = path.join(userData, 'active_win_helper.cs');
  helperExePath = path.join(userData, 'active_win_helper.exe');

  // Zaten derlenmişse tekrar derleme
  if (fs.existsSync(helperExePath)) {
    return;
  }

  const csCode = `using System;
using System.Runtime.InteropServices;
using System.Text;
class Program {
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    static void Main() {
        IntPtr hwnd = GetForegroundWindow();
        StringBuilder className = new StringBuilder(256);
        GetClassName(hwnd, className, 256);
        Console.WriteLine(className.ToString());
    }
}`;

  try {
    fs.writeFileSync(csPath, csCode, 'utf8');
    const winDir = process.env.windir || 'C:\\\\Windows';
    const cscPath = path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe');
    
    if (fs.existsSync(cscPath)) {
      const compileCmd = `"${cscPath}" /out:"${helperExePath}" /target:exe "${csPath}"`;
      exec(compileCmd, (err) => {
        if (err) {
          console.error('C# Helper derleme hatası:', err);
          helperExePath = null;
        } else {
          try { fs.unlinkSync(csPath); } catch (e) {}
        }
      });
    } else {
      helperExePath = null;
    }
  } catch (err) {
    console.error('Helper hazırlama hatası:', err);
    helperExePath = null;
  }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// ═══════════════════════════════════════════════════════════════
// Pencere Oluşturma
// ═══════════════════════════════════════════════════════════════

function createWindow() {
  // Kaydedilmiş pencere konumu ve boyutunu oku
  // Varsayılan olarak en küçük boyutta (900x600) başlasın
  let windowBounds = { width: 900, height: 600 };
  let isFirstRun = false;
  try {
    if (db.isReady()) {
      const savedBounds = db.getSetting('windowBounds');
      if (savedBounds) {
        windowBounds = { ...windowBounds, ...JSON.parse(savedBounds) };
      } else {
        isFirstRun = true;
      }
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

  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    show: false, // ready-to-show ile göster (flicker engelleme)
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // Off-screen prevention: Pencerenin görünür bir ekran sınırında olduğundan emin ol
  if (windowBounds.x !== undefined && windowBounds.y !== undefined) {
    const displays = screen.getAllDisplays();
    const isVisible = displays.some(display => {
      const { x, y, width, height } = display.bounds;
      return windowBounds.x >= x && 
             windowBounds.x < x + width && 
             windowBounds.y >= y && 
             windowBounds.y < y + height;
    });
    if (!isVisible) {
      mainWindow.center();
    }
  }

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // DevTools sadece --dev argümanı varken aç
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Pencere hazır olunca göster (beyaz flaş engelleme)
  // --hidden veya --startup argümanıyla başlatıldıysa pencereyi gösterme
  mainWindow.once('ready-to-show', () => {
    if (!startHidden) {
      mainWindow.show();
    }
  });

  // Kapatma → tray'e küçült (gerçekten kapatma)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (!trayBalloonShown && tray) {
        try {
          tray.displayBalloon({
            title: 'ClipBoardPrime',
            content: 'Uygulama sistem tepsisinde çalışmaya devam ediyor. Açmak için sistem tepsisi simgesine tıklayabilir veya Ctrl+Shift+V kısayolunu kullanabilirsiniz.',
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const bounds = mainWindow.getBounds();
        db.saveSetting('windowBounds', JSON.stringify(bounds));
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

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Göster',
      click: () => {
        showWindow();
      },
    },
    {
      label: 'Ayarlar',
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
      label: 'Çıkış',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

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
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
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
  // Mevcut clipboard içeriğini oku (karşılaştırma için)
  try {
    lastClipboardText = clipboard.readText() || '';
    lastClipboardHtml = clipboard.readHTML() || '';
    const img = clipboard.readImage();
    if (img && !img.isEmpty()) {
      lastClipboardImageHash = hashImage(img);
    }
  } catch (err) {
    console.error('İlk clipboard okuma hatası:', err);
  }

  // Polling interval ayarını oku
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

// Blur handler hızlı tetiklenmeye karşı debounce - pencere focus dalgalanmalarını engeller
const _blurHandlerDebounced = debounce(() => {
  try {
    if (!db.isReady()) return;
    const blurToTray = db.getSetting('blurToTray');
    if (blurToTray !== 'true') return;
    if (isModalOpen || isQuitting) return;
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;

    if (helperExePath && fs.existsSync(helperExePath)) {
      exec(`"${helperExePath}"`, { timeout: 100 }, (err, stdout) => {
        if (!err && stdout) {
          const activeClass = stdout.trim();
          if (activeClass === 'Progman' || activeClass === 'WorkerW' || activeClass === 'Shell_TrayWnd') {
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
              mainWindow.hide();
              lastBlurTime = Date.now();
            }
          }
        } else {
          if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
            mainWindow.hide();
            lastBlurTime = Date.now();
          }
        }
      });
    } else {
      mainWindow.hide();
      lastBlurTime = Date.now();
    }
  } catch (err) {
    // Sessizce geç
  }
}, 80);

function areFormatsEqual(f1, f2) {
  if (f1.length !== f2.length) return false;
  // Sıra bağımsız karşılaştırma — [png, bitmap] === [bitmap, png] olmalı
  const s1 = [...f1].sort();
  const s2 = [...f2].sort();
  return s1.every((v, i) => v === s2[i]);
}

function updateLastClipboardState() {
  lastClipboardText = clipboard.readText() || '';
  lastClipboardHtml = clipboard.readHTML() || '';
  lastFormats = clipboard.availableFormats() || [];
  
  const img = clipboard.readImage();
  if (img && !img.isEmpty()) {
    lastClipboardImageHash = hashImage(img);
    lastImageSize = img.getSize();
  } else {
    lastClipboardImageHash = '';
    lastImageSize = { width: 0, height: 0 };
  }
}

function checkClipboard() {
  if (isWritingToClipboard) return;

  const currentFormats = clipboard.availableFormats() || [];
  const currentText = clipboard.readText() || '';
  const currentHtml = clipboard.readHTML() || '';

  // Panoda görsel var mı? Her poll'da hash'i yeniden hesapla —
  // format listesi aynı kalsa bile görsel içeriği değişmiş olabilir (ard arda ekran görüntüsü).
  const hasImage = currentFormats.some(f => f.toLowerCase().includes('image') || f.toLowerCase().includes('bitmap'));
  let currentImage = null;
  let currentHash = lastClipboardImageHash;

  if (hasImage) {
    currentImage = clipboard.readImage();
    if (currentImage && !currentImage.isEmpty()) {
      currentHash = hashImage(currentImage);
    }
  } else {
    currentHash = '';
  }

  // Değişiklik yoksa doğrudan çık
  if (
    currentText === lastClipboardText &&
    currentHtml === lastClipboardHtml &&
    areFormatsEqual(currentFormats, lastFormats) &&
    currentHash === lastClipboardImageHash
  ) {
    return;
  }

  // Değişiklik algılandı, yeni durumu sakla
  lastClipboardText = currentText;
  lastClipboardHtml = currentHtml;
  lastFormats = currentFormats;
  lastClipboardImageHash = currentHash;

  // Görsel kontrolü
  if (currentImage && !currentImage.isEmpty()) {
    handleNewImage(currentImage);
    return;
  }

  const trimmedText = currentText ? currentText.trim() : '';

  // 1. Özel Metin Tipleri Kontrolü (Kod, URL, E-posta)
  if (trimmedText.length > 0) {
    // URL Kontrolü
    if (/^https?:\/\/[^\s]+$/i.test(trimmedText) || /^www\.[^\s]+$/i.test(trimmedText)) {
      handleNewClipboardItem(currentText, 'url');
      return;
    }
    // E-posta Kontrolü
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmedText)) {
      handleNewClipboardItem(currentText, 'email');
      return;
    }
    // Kod Kontrolü (Zengin metin olsun olmasın, düz metin kod ise koddur)
    if (isCodeContent(currentText)) {
      handleNewClipboardItem(currentText, 'code');
      return;
    }
  }

  // 2. HTML (Zengin Metin) Kontrolü
  if (currentHtml && currentHtml.trim().length > 0) {
    const strippedHtml = currentHtml.replace(/<[^>]*>/g, '').trim();
    const isRichContent = currentHtml.includes('<') && strippedHtml !== currentText.trim();

    if (isRichContent) {
      handleNewClipboardItem(currentHtml, 'html');
      return;
    }
  }

  // 3. Normal Düz Metin Kontrolü
  if (currentText && currentText.trim().length > 0) {
    handleNewClipboardItem(currentText, 'text');
    return;
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

    // Renderer'a bildir
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('clipboard-changed', item);
    }
  } catch (err) {
    console.error('Clipboard öğesi kaydetme hatası:', err);
  }
}

/**
 * Yeni görsel clipboard öğesini işler.
 */
function handleNewImage(image) {
  if (!db.isReady()) return;

  try {
    // Görseli dosyaya kaydet — DB ile aynı klasörü kullan (özel konum destekli)
    // Öncelik: activeDataDir > getDbPath() > userData (her senaryoda doğru yere gider)
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
      char_count: 0,
    });

    // Renderer'a bildir
    if (mainWindow && !mainWindow.isDestroyed()) {
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

function registerGlobalShortcuts() {
  try {
    let shortcut = 'Ctrl+Shift+V';
    if (db.isReady()) {
      const saved = db.getSetting('globalShortcut');
      if (saved) shortcut = saved;
    }

    const registered = globalShortcut.register(shortcut, () => {
      toggleWindow();
    });

    if (!registered) {
      console.warn(`Global kısayol kaydedilemedi: ${shortcut}`);
    }
  } catch (err) {
    console.error('Global kısayol kayıt hatası:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// IPC Handlers
// ═══════════════════════════════════════════════════════════════

function registerIPCHandlers() {
  ipcMain.on('get-cached-settings', (event) => {
    try {
      if (db.isReady()) {
        event.returnValue = db.getAllSettings();
      } else {
        event.returnValue = null;
      }
    } catch (err) {
      console.error('get-cached-settings hatası:', err);
      event.returnValue = null;
    }
  });

  ipcMain.handle('get-app-info', async () => {
    try {
      return {
        success: true,
        data: {
          name: app.getName(),
          version: app.getVersion(),
          isDev: isDev,
          isPortable: isPortable,
          author: 'ClipBoardPrime',
        }
      };
    } catch (err) {
      console.error('get-app-info hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('reveal-sensitive-content', async (_event, id) => {
    try {
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
        db.cleanupOrphanImages();
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
      const result = db.deleteClipboardItem(id);
      return { success: true, data: result };
    } catch (err) {
      console.error('delete-clipboard-item hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('clear-clipboard-history', async () => {
    try {
      const count = db.clearHistory();
      return { success: true, data: { deleted: count } };
    } catch (err) {
      console.error('clear-clipboard-history hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('toggle-pin-clipboard', async (_event, id) => {
    try {
      const item = db.togglePin(id);
      return { success: true, data: item };
    } catch (err) {
      console.error('toggle-pin-clipboard hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('toggle-favorite-clipboard', async (_event, id) => {
    try {
      const item = db.toggleFavorite(id);
      return { success: true, data: item };
    } catch (err) {
      console.error('toggle-favorite-clipboard hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('copy-to-clipboard', async (_event, { id, content, type, ignoreChange = true }) => {
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

      if (type === 'image') {
        // Görsel dosyasını oku ve clipboard'a yaz
        if (fs.existsSync(actualContent)) {
          const img = nativeImage.createFromPath(actualContent);
          clipboard.writeImage(img);
        } else {
          return { success: false, error: 'Görsel dosyası bulunamadı' };
        }
      } else if (type === 'html') {
        clipboard.writeHTML(actualContent);
        // Metin olarak da yaz ki düz metin yapıştırma çalışsın
        const plainText = actualContent.replace(/<[^>]*>/g, '');
        clipboard.write({
          text: plainText,
          html: actualContent,
        });
      } else {
        clipboard.writeText(actualContent);
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
      const clipItem = db.getClipboardItemById(id);
      if (!clipItem) {
        return { success: false, error: 'Clipboard öğesi bulunamadı' };
      }

      const note = db.addNote({
        title: clipItem.preview
          ? clipItem.preview.substring(0, 50)
          : 'Panodan Not',
        content: clipItem.content,
        color: '#3b82f6',
      });

      return { success: true, data: note };
    } catch (err) {
      console.error('clip-to-note hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('paste-to-active-window', async (_event, params) => {
    let id, content;
    if (params && typeof params === 'object') {
      id = params.id;
      content = params.content;
    } else {
      content = params;
    }
    isWritingToClipboard = true;
    try {
      let actualContent = content;
      if (id) {
        const item = db.getClipboardItemById(id);
        if (item) {
          actualContent = item.content;
        }
      }

      clipboard.writeText(actualContent);

      // Clipboard değerlerini güncelle
      updateLastClipboardState();

      // Yapıştırılan metni de veritabanında en üste taşı/ekle
      if (db.isReady()) {
        try {
          let isSensitive = 0;
          const detectSensitive = db.getSetting('detectSensitive');
          if (detectSensitive === 'true') {
            isSensitive = detectSensitiveContent(actualContent) ? 1 : 0;
          }

          let contentType = 'text';
          const trimmed = actualContent.trim();
          if (/^https?:\/\/[^\s]+$/i.test(trimmed) || /^www\.[^\s]+$/i.test(trimmed)) {
            contentType = 'url';
          } else if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
            contentType = 'email';
          } else if (isCodeContent(trimmed)) {
            contentType = 'code';
          }

          const item = db.addClipboardItem({
            content: actualContent,
            content_type: contentType,
            is_sensitive: isSensitive,
            char_count: actualContent.length,
          });

          // Renderer'a bildir ki arayüzde en üste çıksın
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('clipboard-changed', item);
          }
        } catch (dbErr) {
          console.error('Yapıştırma sırasında DB güncellenemedi:', dbErr);
        }
      }

      // Aktif pencereye yapıştırmak için ClipBoardPrime'ın odağı kaybetmesi (gizlenmesi) şarttır.
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }

      // VBScript/WScript.Shell tabanlı tuş simülasyonu (PowerShell'den çok daha hızlı ve hafiftir)
      setTimeout(() => {
        const tempVbsPath = path.join(app.getPath('temp'), `paste_${Date.now()}.vbs`);
        try {
          fs.writeFileSync(tempVbsPath, 'Set WshShell = WScript.CreateObject("WScript.Shell")\nWScript.Sleep 50\nWshShell.SendKeys "^v"');
          exec(`wscript.exe "${tempVbsPath}"`, (err) => {
            if (err) {
              console.error('VBScript yapıştırma hatası, fallback uygulanıyor:', err);
              // Fallback: mshta yöntemi
              exec('mshta vbscript:Close(CreateObject("WScript.Shell").SendKeys("^v"))');
            }
            try { fs.unlinkSync(tempVbsPath); } catch (e) {}
          });
        } catch (vbsErr) {
          console.error('VBScript oluşturma hatası, fallback uygulanıyor:', vbsErr);
          exec('mshta vbscript:Close(CreateObject("WScript.Shell").SendKeys("^v"))');
        }
      }, 150);

      return { success: true };
    } catch (err) {
      console.error('paste-to-active-window hatası:', err);
      return { success: false, error: err.message };
    } finally {
      // isWritingToClipboard VBScript callback'inde sıfırlanıyor (race condition önlendi)
      // Ancak hata durumunda buradan da sıfırla
      setTimeout(() => {
        isWritingToClipboard = false;
      }, 600);
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
      const result = db.deleteNote(id);
      return { success: true, data: result };
    } catch (err) {
      console.error('delete-note hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('toggle-favorite-note', async (_event, id) => {
    try {
      const note = db.toggleFavoriteNote(id);
      return { success: true, data: note };
    } catch (err) {
      console.error('toggle-favorite-note hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('toggle-pin-note', async (_event, id) => {
    try {
      const note = db.togglePinNote(id);
      return { success: true, data: note };
    } catch (err) {
      console.error('toggle-pin-note hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('update-note-date', async (_event, id, newDateStr) => {
    try {
      const result = db.updateNoteDate(id, newDateStr);
      return { success: true, data: result };
    } catch (err) {
      console.error('update-note-date hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('reorder-notes', async (_event, orderedIds) => {
    try {
      db.reorderNotes(orderedIds);
      return { success: true };
    } catch (err) {
      console.error('reorder-notes hatası:', err);
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

  ipcMain.handle('save-setting', async (_event, { key, value }) => {
    try {
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
        title: 'Veri Konumu Seçin',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Bu Klasörü Seç',
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

  ipcMain.handle('export-data', async () => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Veriyi Dışa Aktar',
        defaultPath: `clipboard-pro-backup-${formatDate(new Date())}.json`,
        filters: [
          { name: 'JSON Dosyası', extensions: ['json'] },
        ],
        buttonLabel: 'Dışa Aktar',
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'İptal edildi' };
      }

      const exportData = db.exportAll();
      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf8');

      return { success: true, data: { path: result.filePath } };
    } catch (err) {
      console.error('export-data hatası:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('import-data', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Veri İçe Aktar',
        filters: [
          { name: 'JSON Dosyası', extensions: ['json'] },
        ],
        properties: ['openFile'],
        buttonLabel: 'İçe Aktar',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'İptal edildi' };
      }

      const fileContent = fs.readFileSync(result.filePaths[0], 'utf8');
      const importData = JSON.parse(fileContent);

      // Doğrulama
      if (!importData.data) {
        return { success: false, error: 'Geçersiz dosya formatı' };
      }

      const importResult = db.importAll(importData);
      return { success: true, data: importResult };
    } catch (err) {
      console.error('import-data hatası:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Stats ────────────────────────────────────────────────────

  ipcMain.handle('get-stats', async () => {
    try {
      const stats = db.getStats();
      return { success: true, data: stats };
    } catch (err) {
      console.error('get-stats hatası:', err);
      return { success: false, error: err.message };
    }
  });

  // ── open-external ────────────────────────────────────────────

  ipcMain.handle('open-external', async (_event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      console.error('open-external hatası:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Modal Durum Bildirimi ─────────────────────────────────────
  // Renderer, modal açıkken blur→hide engellenmesi için bunu bildirir
  ipcMain.on('set-modal-open', (_event, value) => {
    isModalOpen = !!value;
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

    case 'globalShortcut':
      // Global kısayolu güncelle
      globalShortcut.unregisterAll();
      registerGlobalShortcuts();
      break;

    case 'startWithWindows':
      // Başlangıçta aç ayarını güncelle
      setWindowsAutostart(value === 'true');
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
  // C# aktif pencere tespit aracını derle
  compileActiveWinHelper();

  // Varsayılan üst menü çubuğunu (File, Edit, View vb.) kaldırır
  Menu.setApplicationMenu(null);

  // local-file protokolünü tanımla (yerel görselleri güvenle yüklemek için)
  protocol.handle('local-file', (request) => {
    try {
      let urlPath = request.url.replace('local-file:///', '');
      if (request.url.startsWith('local-file://') && !request.url.startsWith('local-file:///')) {
        urlPath = request.url.replace('local-file://', '');
      }
      const decodedPath = decodeURIComponent(urlPath);
      if (fs.existsSync(decodedPath)) {
        const data = fs.readFileSync(decodedPath);
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
          '.svg': 'image/svg+xml',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        return new Response(data, {
          headers: { 'Content-Type': contentType }
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
    const dbOptions = { encrypt: encryptText, decrypt: decryptText };

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
    setWindowsAutostart(startWithWindows);

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

  // Pencereyi oluştur
  createWindow();

  // System tray oluştur
  createTray();

  // Global kısayolları kaydet
  registerGlobalShortcuts();

  // IPC handler'ları kaydet
  registerIPCHandlers();

  // Clipboard izlemeyi başlat
  startClipboardWatcher();
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
  db.close();

  // Tray'i temizle
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

// Beklenmeyen hataları yakala
process.on('uncaughtException', (err) => {
  console.error('Yakalanmamış hata:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('İşlenmemiş Promise hatası:', reason);
});
