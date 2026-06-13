/**
 * ClipBoard Pro — Electron Main Process
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
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./database/db');

// ─── Genel Değişkenler ──────────────────────────────────────
let mainWindow = null;
let tray = null;
let clipboardWatcher = null;
let isQuitting = false;
let lastClipboardText = '';
let lastClipboardHtml = '';
let lastClipboardImageHash = '';
let ignoreNextClipboardChange = false; // Kendi yazdığımız clipboard'u ignore et
const isDev = process.argv.includes('--dev');

// Geliştirme modunda çakışmaları önlemek için farklı bir userData dizini kullan
if (isDev) {
  const devDataPath = path.join(app.getPath('appData'), 'clipboard-pro-app-dev');
  app.setPath('userData', devDataPath);
}

// Tek instance kilidi
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// ═══════════════════════════════════════════════════════════════
// Pencere Oluşturma
// ═══════════════════════════════════════════════════════════════

function createWindow() {
  // Kaydedilmiş pencere konumu ve boyutunu oku
  let windowBounds = { width: 1200, height: 800 };
  try {
    if (db.isReady()) {
      const savedBounds = db.getSetting('windowBounds');
      if (savedBounds) {
        windowBounds = { ...windowBounds, ...JSON.parse(savedBounds) };
      }
    }
  } catch (err) {
    // Kayıtlı konum yoksa varsayılan kullan
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
    icon: getTrayIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // DevTools sadece --dev argümanı varken aç
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Pencere hazır olunca göster (beyaz flaş engelleme)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Kapatma → tray'e küçült (gerçekten kapatma)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
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
 * Tray ikonu yolunu döner. Her başlatmada güncel ikonu programatik oluşturur.
 */
function getTrayIconPath() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');

  try {
    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    // Her zaman en güncel mavi premium ikonu yaz
    const icon = createTrayIcon();
    fs.writeFileSync(iconPath, icon.toPNG());
  } catch (err) {
    console.error('Tray ikonu oluşturma hatası:', err);
    return null;
  }

  return iconPath;
}

function isPointOnSquareBorder(x, y, x1, y1, x2, y2, w) {
  const halfW = w / 2;
  const left = Math.abs(x - x1) <= halfW && y >= y1 - halfW && y <= y2 + halfW;
  const right = Math.abs(x - x2) <= halfW && y >= y1 - halfW && y <= y2 + halfW;
  const top = Math.abs(y - y1) <= halfW && x >= x1 - halfW && x <= x2 + halfW;
  const bottom = Math.abs(y - y2) <= halfW && x >= x1 - halfW && x <= x2 + halfW;
  return left || right || top || bottom;
}

/**
 * Programatik olarak premium 64x64 mavi copy/clipboard ikonu oluşturur.
 */
function createTrayIcon() {
  const size = 64;
  const canvas = Buffer.alloc(size * size * 4);

  // Background rounded rect params
  const rx1 = 4, ry1 = 4, rx2 = 59, ry2 = 59;
  const R = 14;
  const cx1 = rx1 + R, cx2 = rx2 - R;
  const cy1 = ry1 + R, cy2 = ry2 - R;

  // Square params
  const w = 2.5; // thickness
  // Back square: top-left
  const bx1 = 18, by1 = 18, bx2 = 39, by2 = 39;
  // Front square: bottom-right
  const fx1 = 25, fy1 = 25, fx2 = 46, fy2 = 46;
  const gap = 2.0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Check if point is inside the rounded rect
      let insideRoundedRect = false;
      if (x >= rx1 && x <= rx2 && y >= ry1 && y <= ry2) {
        if (x < cx1 && y < cy1) {
          insideRoundedRect = (x - cx1)**2 + (y - cy1)**2 <= R**2;
        } else if (x > cx2 && y < cy1) {
          insideRoundedRect = (x - cx2)**2 + (y - cy1)**2 <= R**2;
        } else if (x < cx1 && y > cy2) {
          insideRoundedRect = (x - cx1)**2 + (y - cy2)**2 <= R**2;
        } else if (x > cx2 && y > cy2) {
          insideRoundedRect = (x - cx2)**2 + (y - cy2)**2 <= R**2;
        } else {
          insideRoundedRect = true;
        }
      }

      if (insideRoundedRect) {
        // Draw the overlapping squares
        const onFrontBorder = isPointOnSquareBorder(x, y, fx1, fy1, fx2, fy2, w);
        const insideFrontMask = x >= (fx1 - gap) && x <= (fx2 + gap) && y >= (fy1 - gap) && y <= (fy2 + gap);
        const onBackBorder = isPointOnSquareBorder(x, y, bx1, by1, bx2, by2, w);

        if (onFrontBorder) {
          // White front square border
          canvas[idx] = 255;
          canvas[idx + 1] = 255;
          canvas[idx + 2] = 255;
          canvas[idx + 3] = 255;
        } else if (insideFrontMask) {
          // Blue gap/interior of front square (Royal Blue #2563eb)
          canvas[idx] = 37;
          canvas[idx + 1] = 99;
          canvas[idx + 2] = 235;
          canvas[idx + 3] = 255;
        } else if (onBackBorder) {
          // White back square border
          canvas[idx] = 255;
          canvas[idx + 1] = 255;
          canvas[idx + 2] = 255;
          canvas[idx + 3] = 255;
        } else {
          // Blue background (Royal Blue #2563eb)
          canvas[idx] = 37;
          canvas[idx + 1] = 99;
          canvas[idx + 2] = 235;
          canvas[idx + 3] = 255;
        }
      } else {
        // Transparent
        canvas[idx] = 0;
        canvas[idx + 1] = 0;
        canvas[idx + 2] = 0;
        canvas[idx + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, {
    width: size,
    height: size,
  });
}

/**
 * System tray'i oluşturur.
 */
function createTray() {
  const iconPath = getTrayIconPath();
  let trayIcon;

  if (iconPath && fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    trayIcon = createTrayIcon();
  }

  // Windows'ta ikon boyutunu küçült
  trayIcon = trayIcon.resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip('ClipBoardPro');

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
  } else if (mainWindow.isVisible()) {
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

/**
 * Clipboard'da değişiklik olup olmadığını kontrol eder.
 */
function checkClipboard() {
  // Kendi yazdığımız clipboard'u atla
  if (ignoreNextClipboardChange) {
    ignoreNextClipboardChange = false;
    // Yeni değerleri kaydet (sonraki karşılaştırma için)
    lastClipboardText = clipboard.readText() || '';
    lastClipboardHtml = clipboard.readHTML() || '';
    const img = clipboard.readImage();
    if (img && !img.isEmpty()) {
      lastClipboardImageHash = hashImage(img);
    }
    return;
  }

  // Görsel kontrolü
  const currentImage = clipboard.readImage();
  if (currentImage && !currentImage.isEmpty()) {
    const currentHash = hashImage(currentImage);
    if (currentHash !== lastClipboardImageHash) {
      lastClipboardImageHash = currentHash;
      // Yeni görsel bulundu
      handleNewImage(currentImage);
      return;
    }
  }

  // Metin kontrolü
  const currentText = clipboard.readText() || '';
  const currentHtml = clipboard.readHTML() || '';

  // HTML içeriği var mı ve metin içeriğinden farklı mı?
  if (currentHtml && currentHtml.trim().length > 0 && currentHtml !== lastClipboardHtml) {
    // HTML içeriğinin sadece metin wrapper'ı olmadığını kontrol et
    const strippedHtml = currentHtml.replace(/<[^>]*>/g, '').trim();
    const isRichContent = currentHtml.includes('<') && strippedHtml !== currentText.trim();

    if (isRichContent && currentHtml !== lastClipboardHtml) {
      lastClipboardHtml = currentHtml;
      lastClipboardText = currentText;
      handleNewClipboardItem(currentHtml, 'html');
      return;
    }
  }

  // Düz metin kontrolü
  if (currentText && currentText.trim().length > 0 && currentText !== lastClipboardText) {
    lastClipboardText = currentText;
    lastClipboardHtml = currentHtml;
    handleNewClipboardItem(currentText, 'text');
    return;
  }
}

/**
 * Yeni clipboard öğesini işler ve DB'ye kaydeder.
 */
function handleNewClipboardItem(content, contentType) {
  console.log('handleNewClipboardItem tetiklendi! content:', content ? content.substring(0, 50) : '', 'contentType:', contentType);

  // Otomatik içerik tipi algılama
  if (contentType === 'text') {
    const trimmed = content.trim();
    if (/^https?:\/\/[^\s]+$/i.test(trimmed) || /^www\.[^\s]+$/i.test(trimmed)) {
      contentType = 'url';
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
    // Görseli dosyaya kaydet
    const imagesDir = path.join(app.getPath('userData'), 'images');
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
 */
function hashImage(image) {
  try {
    const buffer = image.toBitmap();
    return crypto.createHash('md5').update(buffer).digest('hex');
  } catch (err) {
    return '';
  }
}

/**
 * Hassas içerik algılama (kredi kartı, şifre vb.).
 */
function detectSensitiveContent(text) {
  const patterns = [
    // Kredi kartı numarası (basit pattern)
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
    // Sosyal güvenlik numarası benzeri
    /\b\d{3}[\s-]\d{2}[\s-]\d{4}\b/,
    // E-posta + şifre kombinasyonu
    /password\s*[:=]\s*\S+/i,
    /şifre\s*[:=]\s*\S+/i,
    /parola\s*[:=]\s*\S+/i,
    // API key benzeri
    /api[_-]?key\s*[:=]\s*\S+/i,
    // Secret/token benzeri
    /secret\s*[:=]\s*\S+/i,
    /token\s*[:=]\s*\S+/i,
    // Private key
    /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  ];

  return patterns.some((pattern) => pattern.test(text));
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

  ipcMain.handle('copy-to-clipboard', async (_event, { content, type, ignoreChange = true }) => {
    console.log('copy-to-clipboard IPC tetiklendi! content:', content ? content.substring(0, 50) : '', 'type:', type, 'ignoreChange:', ignoreChange);
    try {
      if (ignoreChange) {
        ignoreNextClipboardChange = true;
      }

      if (type === 'image') {
        // Görsel dosyasını oku ve clipboard'a yaz
        if (fs.existsSync(content)) {
          const img = nativeImage.createFromPath(content);
          clipboard.writeImage(img);
        } else {
          return { success: false, error: 'Görsel dosyası bulunamadı' };
        }
      } else if (type === 'html') {
        clipboard.writeHTML(content);
        // Metin olarak da yaz ki düz metin yapıştırma çalışsın
        const plainText = content.replace(/<[^>]*>/g, '');
        clipboard.write({
          text: plainText,
          html: content,
        });
      } else {
        clipboard.writeText(content);
      }

      if (!ignoreChange) {
        if (type === 'image') {
          const isExistingDbImage = content && content.includes('images') && fs.existsSync(content);
          if (isExistingDbImage) {
            try {
              const item = db.addClipboardItem({
                content: `[Görsel]`,
                content_type: 'image',
                image_path: content,
                char_count: 0,
              });
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('clipboard-changed', item);
              }
            } catch (err) {
              console.error('Görsel güncelleme hatası:', err);
            }
          } else {
            if (fs.existsSync(content)) {
              const img = nativeImage.createFromPath(content);
              handleNewImage(img);
            }
          }
        } else {
          handleNewClipboardItem(content, type || 'text');
        }
      }

      // Yeni değerleri sakla (sonraki karşılaştırma için)
      lastClipboardText = clipboard.readText() || '';
      lastClipboardHtml = clipboard.readHTML() || '';
      const img = clipboard.readImage();
      if (img && !img.isEmpty()) {
        lastClipboardImageHash = hashImage(img);
      }

      return { success: true };
    } catch (err) {
      console.error('copy-to-clipboard hatası:', err);
      ignoreNextClipboardChange = false;
      return { success: false, error: err.message };
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

  ipcMain.handle('paste-to-active-window', async (_event, content) => {
    console.log('paste-to-active-window IPC tetiklendi! content:', content ? content.substring(0, 50) : '');
    try {
      ignoreNextClipboardChange = true;
      clipboard.writeText(content);

      // Clipboard değerlerini güncelle
      lastClipboardText = content;
      lastClipboardHtml = clipboard.readHTML() || '';

      // Çift tıklayarak yapıştırılan metni de veritabanında en üste taşı/ekle
      if (db.isReady()) {
        try {
          let isSensitive = 0;
          const detectSensitive = db.getSetting('detectSensitive');
          if (detectSensitive === 'true') {
            isSensitive = detectSensitiveContent(content) ? 1 : 0;
          }

          const item = db.addClipboardItem({
            content: content,
            content_type: 'text',
            is_sensitive: isSensitive,
            char_count: content.length,
          });

          // Renderer'a bildir ki arayüzde en üste çıksın
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('clipboard-changed', item);
          }
        } catch (dbErr) {
          console.error('Yapıştırma sırasında DB güncellenemedi:', dbErr);
        }
      }

      // Pencereyi gizle (kullanıcı yapıştırabilsin)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }

      return { success: true };
    } catch (err) {
      console.error('paste-to-active-window hatası:', err);
      ignoreNextClipboardChange = false;
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
      try {
        app.setLoginItemSettings({
          openAtLogin: value === 'true',
          path: app.getPath('exe'),
        });
      } catch (err) {
        console.error('Otomatik başlatma ayarı hatası:', err);
      }
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
  try {
    // Veritabanını başlat
    const customLocation = '';
    db.initialize(app.getPath('userData'), customLocation);

    // Özel veri konumu varsa yeniden aç
    const savedLocation = db.getSetting('dataLocation');
    if (savedLocation && savedLocation.length > 0) {
      try {
        db.initialize(savedLocation);
      } catch (err) {
        console.error('Özel veri konumu açılamadı, varsayılan kullanılıyor:', err);
        db.initialize(app.getPath('userData'));
      }
    }
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
