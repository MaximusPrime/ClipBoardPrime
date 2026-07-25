const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('statik arayüz kodu inline stil üretmez', () => {
  const sources = [
    read('src/index.html'),
    ...fs.readdirSync(path.join(root, 'src', 'js'))
      .filter((filename) => filename.endsWith('.js'))
      .map((filename) => read(path.join('src', 'js', filename))),
  ];

  assert.equal(
    sources.some((source) => /\bstyle\s*=\s*["']/.test(source)),
    false,
    'HTML veya renderer şablonlarında inline style kullanılmamalı',
  );
});

test('CSS geçişleri tüm özellikleri hedeflemez', () => {
  const css = read('src/styles/main.css');
  assert.equal(
    /transition\s*:\s*all\b/.test(css),
    false,
    'transition: all yerine değişen özellikler açıkça belirtilmeli',
  );
});

test('renderer tarafından kullanılan statik element kimlikleri HTML içinde bulunur', () => {
  const html = read('src/index.html');
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const runtimeIds = new Set([
    'initial-panel-width-style',
    'image-viewer-modal',
    'portable-warning-box',
  ]);
  const missing = [];

  for (const filename of fs.readdirSync(path.join(root, 'src', 'js'))) {
    if (!filename.endsWith('.js')) continue;
    const source = read(path.join('src', 'js', filename));
    for (const match of source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
      if (!htmlIds.has(match[1]) && !runtimeIds.has(match[1])) {
        missing.push(`${filename}: #${match[1]}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

test('preload invoke kanallarının ana süreçte bir handler karşılığı vardır', () => {
  const preload = read('preload.js');
  const main = read('main.js');
  const invokeBlock = preload.match(/const ALLOWED_INVOKE_CHANNELS = \[([\s\S]*?)\];/);
  assert.ok(invokeBlock, 'Preload invoke izin listesi bulunamadı');

  const allowed = [...invokeBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const handlers = new Set(
    [...main.matchAll(/ipcMain\.handle\(['"]([^'"]+)['"]/g)].map((match) => match[1])
  );
  const missing = allowed.filter((channel) => !handlers.has(channel));
  assert.deepEqual(missing, []);
});

test('IPC handlerları renderer penceresi oluşturulmadan önce kaydedilir', () => {
  const mainSource = read('main.js');
  const registerIndex = mainSource.lastIndexOf('registerIPCHandlers();');
  const createIndex = mainSource.lastIndexOf('createWindow();');

  assert.ok(registerIndex >= 0, 'registerIPCHandlers çağrısı bulunamadı');
  assert.ok(createIndex >= 0, 'createWindow çağrısı bulunamadı');
  assert.ok(
    registerIndex < createIndex,
    'Renderer IPC çağrıları başlamadan önce handlerlar kaydedilmelidir'
  );
});

test('pano öğesi olayları öğe kapsamındaki bağlama fonksiyonunda kalır', () => {
  const source = read('src/js/clipboard-panel.js');
  const contextMenuBlock = source.match(
    /function setupContextMenuActions\(\) \{([\s\S]*?)\r?\n  \}\r?\n\r?\n  async function executeItemAction/
  );

  assert.ok(contextMenuBlock, 'setupContextMenuActions fonksiyonu bulunamadı');
  assert.doesNotMatch(
    contextMenuBlock[1],
    /\bel\.addEventListener\b/,
    'Öğe kapsamındaki el değişkeni global context-menu kurulumunda kullanılamaz'
  );
});

test('pencere konumu çalışma alanı modunu zorla değiştirmez', () => {
  const source = read('main.js');
  const resolverBlock = source.match(
    /function resolveWorkspaceOpenMode\(\) \{([\s\S]*?)\n\}/
  );

  assert.ok(resolverBlock, 'resolveWorkspaceOpenMode fonksiyonu bulunamadı');
  assert.doesNotMatch(resolverBlock[1], /windowOpenPosition/);
  assert.match(resolverBlock[1], /workspaceOpenMode/);
});

test('imleç yanında açılış seçili ekranı değiştirmeden yalnızca pencereyi konumlandırır', () => {
  const source = read('main.js');
  const positionBlock = source.match(
    /function positionWindowForOpen\(\) \{([\s\S]*?)\n\}/
  );

  assert.ok(positionBlock, 'positionWindowForOpen fonksiyonu bulunamadı');
  assert.match(positionBlock[1], /windowOpenPosition/);
  assert.match(positionBlock[1], /setPosition/);
  assert.doesNotMatch(positionBlock[1], /applyWorkspaceMode/);
  assert.doesNotMatch(source, /cursorPresentationState/);
  assert.match(read('src/js/app.js'), /onWindowVisibilityChanged/);
});

test('onboarding tercihleri anında önizlenir ve pencereye uygulanır', () => {
  const source = read('src/js/onboarding.js');
  assert.match(source, /App\.setWorkspaceMode\(selectedWorkspace,\s*true\)/);
  assert.match(source, /addEventListener\('change', previewTheme\)/);
});

test('modal açıkken blur-to-tray pencereyi gizlemez', () => {
  const source = read('main.js');
  const blurBlock = source.match(
    /const _blurHandlerDebounced = debounce\(\(\) => \{([\s\S]*?)\n\}, 80\);/
  );
  assert.ok(blurBlock, 'blur handler bulunamadı');
  assert.match(blurBlock[1], /if \(isModalOpen \|\| Date\.now\(\) < modalProtectionUntil\) return/);
  assert.match(read('src/js/app.js'), /'#settings-modal'/);
});

test('pencere bounds geçişleri eski zamanlayıcı tarafından erken kapatılamaz', () => {
  const source = read('main.js');
  assert.match(source, /workspaceBoundsTransitionId/);
  assert.match(source, /clearTimeout\(workspaceBoundsReleaseTimer\)/);
  assert.match(source, /transitionId === workspaceBoundsTransitionId/);
});

test('Electron renderer navigasyonu ve izinleri varsayılan olarak reddedilir', () => {
  const source = read('main.js');
  assert.match(source, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(source, /webContents\.on\('will-navigate'/);
  assert.match(source, /setPermissionRequestHandler/);
});

test('kategori görünüm alanları IPC sınırında doğrulanır', () => {
  const source = read('main.js');
  assert.match(source, /requireHexColor\(cat\.color/);
  assert.match(source, /requireCategoryIcon\(cat\.icon\)/);
});

test('temel etkileşimler klavye ve ekran okuyucu desteği taşır', () => {
  const app = read('src/js/app.js');
  const html = read('src/index.html');
  const css = read('src/styles/main.css');
  // Single-workspace UI: resizer is intentionally unused; keyboard cards remain accessible
  assert.match(app, /setupKeyboardShortcuts/);
  assert.match(html, /id="toast-container" role="status" aria-live="polite"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(read('src/js/clipboard-panel.js'), /<div class="accordion-view-more"/);
  assert.doesNotMatch(read('src/js/notes-panel.js'), /<div class="accordion-(?:view-more|close-btn)"/);
});

test('Space önizlemesi metin seçimi sırasında açık kalır', () => {
  const source = read('src/js/clipboard-panel.js');
  const css = read('src/styles/main.css');
  assert.match(source, /let previewPinned = false/);
  assert.match(source, /previewPinned = true;\s*showQuickPreview/);
  assert.match(source, /clipboard-quick-preview-body" tabindex="0"/);
  assert.match(css, /\.clipboard-quick-preview-body\s*\{[^}]*user-select:\s*text/s);
});

test('hover kart seçimi ve göz önizleme butonu', () => {
  const clip = read('src/js/clipboard-panel.js');
  const notes = read('src/js/notes-panel.js');
  const utils = read('src/js/utils.js');
  const html = read('src/index.html');
  assert.match(utils, /function hoverSelectCard/);
  assert.match(clip, /Utils\.hoverSelectCard\(el\)/);
  assert.match(notes, /Utils\.hoverSelectCard\(el\)/);
  assert.match(clip, /preview-btn eye-action-btn/);
  assert.match(notes, /detail-btn eye-action-btn/);
  assert.match(notes, /e\.key !== ' ' && e\.key !== 'Escape'/);
  assert.doesNotMatch(html, /setting-hover-preview/);
  assert.doesNotMatch(clip, /hoverPreviewEnabled/);
});

test('etkileşim ayarları pano ve notlarda ayrı bağlı', () => {
  const clip = read('src/js/clipboard-panel.js');
  const notes = read('src/js/notes-panel.js');
  const settings = read('src/js/settings.js');
  const html = read('src/index.html');
  const main = read('main.js');
  const db = read('database/db.js');
  assert.match(html, /id="setting-clipboard-click-opens-preview"/);
  assert.match(html, /id="setting-clipboard-double-click-paste"/);
  assert.match(html, /id="setting-note-content-click-opens-modal"/);
  assert.match(html, /id="setting-note-double-click-opens-modal"/);
  assert.match(settings, /clipboardClickOpensPreview/);
  assert.match(settings, /noteContentClickOpensModal/);
  assert.match(settings, /migrateInteractionSettings/);
  assert.match(main, /clipboardClickOpensPreview/);
  assert.match(main, /noteContentClickOpensModal/);
  assert.match(db, /clipboardClickOpensPreview:\s*'true'/);
  assert.match(db, /noteDoubleClickOpensModal:\s*'false'/);
  assert.match(notes, /noteContentClickOpensModal/);
  assert.match(notes, /noteDoubleClickOpensModal !== 'true'/);
  assert.match(notes, /spaceAction === 'copy'/);
  assert.match(notes, /isHeaderClick/);
  assert.match(clip, /clipboardClickOpensPreview/);
  assert.match(clip, /clipboardDoubleClickPaste/);
  assert.match(clip, /openPinnedQuickPreview\(item, el\)/);
  assert.doesNotMatch(clip, /clip-item-meta[\s\S]{0,80}collapseCard/);
});

test('pano Devamını Gör eylemi ayrı modal yerine Space önizlemesini kullanır', () => {
  const source = read('src/js/clipboard-panel.js');
  const viewMoreBlock = source.match(
    /const viewMoreBtn = el\.querySelector\('\.accordion-view-more'\);([\s\S]*?)\n    \}/
  );
  assert.ok(viewMoreBlock, 'Devamını Gör olay bloğu bulunamadı');
  assert.match(viewMoreBlock[1], /openPinnedQuickPreview\(item, el\)/);
  assert.doesNotMatch(viewMoreBlock[1], /openClipDetailModal/);
  assert.match(source, /event\.key !== 'Escape' && event\.key !== ' '/);
});

test('Space hızlı önizlemesi kompakt pencerenin merkezinde konumlanır', () => {
  const source = read('src/js/clipboard-panel.js');
  const positionBlock = source.match(
    /function positionQuickPreview\(preview, owner\) \{([\s\S]*?)\n  \}/
  );
  assert.ok(positionBlock, 'positionQuickPreview fonksiyonu bulunamadı');
  // Pencere içinde clamp + merkez; kompakt varsayılan
  assert.match(positionBlock[1], /vw - margin - width/);
  assert.match(positionBlock[1], /vh - margin - height/);
  assert.match(positionBlock[1], /needsTempMeasure/);
  assert.match(positionBlock[1], /PREVIEW_COMPACT_MAX_WIDTH/);
  assert.doesNotMatch(positionBlock[1], /owner\.getBoundingClientRect/);
});

test('hızlı önizleme büyütme, boyutlandırma ve kapanınca sıfırlama sunar', () => {
  const source = read('src/js/clipboard-panel.js');
  const css = read('src/styles/main.css');
  assert.match(source, /let previewExpanded = false/);
  assert.match(source, /function togglePreviewExpanded\(\)/);
  assert.match(source, /function startPreviewResize\(/);
  assert.match(source, /function scheduleQuickPreviewRelayout\(\)/);
  assert.match(source, /data-preview-expand/);
  assert.match(source, /data-preview-close/);
  assert.match(source, /data-preview-resize/);
  assert.match(source, /previewExpanded = false;\s*previewCustomSize = null/);
  assert.match(source, /visualViewport/);
  assert.match(css, /\.clipboard-quick-preview\.is-expanded/);
  assert.match(css, /max-width:\s*calc\(100vw - 16px\)/);
  assert.match(css, /max-height:\s*calc\(100vh - 16px\)/);
  assert.match(css, /\.clipboard-quick-preview-resize/);
  assert.match(read('src/js/clipboard-panel.js'), /<kbd title="Space">Space<\/kbd>/);
});

test('not ve pano detay modalları viewport ile dinamik büyür', () => {
  const css = read('src/styles/main.css');
  const notes = read('src/js/notes-panel.js');
  const html = read('src/index.html');
  assert.match(css, /#note-detail-modal \.note-detail-dialog/);
  assert.match(css, /#clip-detail-modal \.detail-dialog/);
  assert.match(css, /\.detail-dialog\s*\{[^}]*max-height:\s*calc\(100vh/s);
  assert.match(css, /\.detail-dialog-body\s*\{[^}]*max-height:\s*none/s);
  assert.doesNotMatch(css, /\.detail-dialog-body\s*\{\s*max-height:\s*400px/);
  assert.match(html, /id="note-detail-expand-btn"/);
  assert.match(html, /id="note-detail-resize"/);
  assert.match(notes, /function toggleDetailExpanded\(\)/);
  assert.match(notes, /function applyDetailDialogSize\(\)/);
  assert.match(notes, /function resetDetailDialogSize\(\)/);
  assert.match(notes, /detailExpanded = false;\s*detailCustomSize = null/);
});

test('Pano ve Notlar geçiş kontrolü başlık çubuğunda geometrik olarak ortalanır', () => {
  const css = read('src/styles/main.css');
  assert.match(css, /#titlebar\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/s);
  assert.match(css, /\.workspace-switcher\s*\{[^}]*justify-self:\s*center/s);
  assert.match(css, /\.titlebar-actions\s*\{[^}]*justify-self:\s*end/s);
});

test('klavye kısayolları güvenli kayıt ve düzenleme alanı koruması kullanır', () => {
  const main = read('main.js');
  const app = read('src/js/app.js');
  const notes = read('src/js/notes-panel.js');
  assert.match(main, /function updateGlobalShortcut/);
  assert.match(main, /globalShortcut\.register\(previous/);
  assert.match(main, /Önceki kısayol korundu/);
  assert.match(app, /target\.matches\('input, textarea, select'\)/);
  assert.match(app, /const closeOrder = \[/);
  assert.match(notes, /e\.key\.toLowerCase\(\) === 'e'/);
  assert.match(notes, /e\.key === 'Home' \|\| e\.key === 'End'/);
  const clipboard = read('src/js/clipboard-panel.js');
  assert.match(clipboard, /e\.key === 'Home' \|\| e\.key === 'End'/);
});

test('veri konumu taşmaz ve hover seçimi arama/modal odağından çalmaz', () => {
  const css = read('src/styles/main.css');
  const clipboard = read('src/js/clipboard-panel.js');
  const notes = read('src/js/notes-panel.js');
  const utils = read('src/js/utils.js');
  assert.match(css, /\.data-location-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto[^}]*min-width:\s*0/s);
  assert.match(css, /\.data-location-path\s*\{[^}]*min-width:\s*0/s);
  // Hover kartı seçer ama input/modal odağından çalmaz
  assert.match(utils, /function canHoverSelectCard/);
  assert.match(utils, /matches\('input, textarea, select'\)/);
  assert.match(utils, /modal-overlay\.active/);
  assert.match(clipboard, /Utils\.hoverSelectCard\(el\)/);
  assert.match(notes, /Utils\.hoverSelectCard\(el\)/);
});

test('pano ve not kartları tutarlı animasyonlu genişletme kontrolü kullanır', () => {
  const notes = read('src/js/notes-panel.js');
  const clipboard = read('src/js/clipboard-panel.js');
  const css = read('src/styles/main.css');
  assert.match(notes, /note-accordion-open-btn/);
  assert.match(notes, /discovery-chevron/);
  assert.match(clipboard, /class="icon-svg expand-icon"/);
  assert.match(css, /@keyframes chevronInvite/);
  assert.match(css, /\.clip-item > \.expand-btn\s*\{[^}]*left:\s*50%/s);
});

test('kompakt not akordiyonu tam detay görünümünün yerini alacak kadar uzamaz', () => {
  const css = read('src/styles/main.css');
  assert.match(css, /\.note-item\.accordion-open \.note-item-accordion\s*\{[^}]*max-height:\s*190px/s);
  assert.match(css, /\.note-item-accordion-content\s*\{[^}]*max-height:\s*150px[^}]*overflow:\s*hidden/s);
});

test('pano kartları içerik uzunluğundan bağımsız kompakt özet gösterir', () => {
  const css = read('src/styles/main.css');
  assert.match(css, /\.clip-item-preview\s*\{[^}]*max-height:\s*2\.9em[^}]*-webkit-line-clamp:\s*2/s);
  assert.match(css, /\.clip-item\.accordion-open \.clip-item-preview\s*\{[^}]*max-height:\s*112px/s);
  assert.match(css, /\.clip-item-image-preview\s*\{[^}]*height:\s*56px/s);
});

test('yerel görsel protokolü ana süreci bloklamaz ve içerik türünü sınırlar', () => {
  const source = read('main.js');
  assert.match(source, /protocol\.handle\('local-file', async/);
  assert.match(source, /fs\.promises\.readFile/);
  assert.doesNotMatch(source, /'\.svg':\s*'image\/svg\+xml'/);
  assert.match(source, /X-Content-Type-Options/);
});

test('kritik ana süreç hataları yalnızca loglanıp devam etmez', () => {
  const source = read('main.js');
  assert.match(source, /function handleFatalProcessError/);
  assert.match(source, /app\.exit\(1\)/);
  assert.match(source, /process\.on\('uncaughtException'.*handleFatalProcessError/s);
});

test('şema migrasyonları başarısız olduğunda başlangıç durdurulur', () => {
  const source = read('database/db.js');
  for (const label of [
    'Notes sort_order migration hatası:',
    'Notes is_favorite migration hatası:',
    'Kategori ikon migrasyon hatası:',
    'URL migrasyon hatası:',
  ]) {
    const index = source.indexOf(label);
    assert.ok(index >= 0, `${label} bulunamadı`);
    assert.match(source.slice(index, index + 140), /throw err/);
  }
});

test('pencere profili kuralları ana süreçten ayrılmış saf bir modüldedir', () => {
  const profiles = require(path.join(root, 'lib', 'window-profiles'));
  assert.equal(profiles.normalizeWorkspaceMode('invalid'), 'clipboard');
  assert.equal(profiles.workspaceBoundsKey('clipboard'), 'windowBounds');
  assert.equal(profiles.workspaceBoundsKey('notes'), 'windowBounds');
  assert.deepEqual(
    profiles.defaultWorkspaceBounds('notes', { x: 20, y: 30 }),
    { x: 20, y: 30, width: 540, height: 640 }
  );
  assert.match(read('main.js'), /require\('\.\/lib\/window-profiles'\)/);
});

test('ilk görünüm ayarları rendererı bloklayan senkron IPC kullanmaz', () => {
  const preload = read('preload.js');
  const main = read('main.js');
  assert.doesNotMatch(preload, /sendSync/);
  assert.doesNotMatch(main, /ipcMain\.on\('get-cached-settings'/);
  assert.match(main, /additionalArguments: \[`--cbp-bootstrap=/);
  assert.match(preload, /function getBootstrapSettings/);
});

test('güvenlik doğrulamaları saf ve bağımsız bir modülde tutulur', () => {
  const validation = require(path.join(root, 'lib', 'input-validation'));
  assert.equal(validation.requireHexColor('#AABBCC'), '#aabbcc');
  assert.equal(validation.requireCategoryIcon('folder'), 'folder');
  assert.throws(() => validation.requireCategoryIcon('<svg>'));
  assert.equal(validation.validateExternalUrl('https://example.com/'), 'https://example.com/');
  assert.throws(() => validation.validateExternalUrl('javascript:alert(1)'));
});

test('kritik responsive yüzeyler sınıf tabanlı ve dar ekran kurallarıyla tanımlıdır', () => {
  const html = read('src/index.html');
  const css = read('src/styles/main.css');
  assert.match(html, /class="modal detail-dialog"/);
  assert.match(html, /class="modal clip-editor-dialog"/);
  assert.match(css, /\.detail-dialog\s*\{/);
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /\.onboarding-modal/);
  const inlineStyleCount = [...html.matchAll(/\sstyle="/g)].length;
  assert.ok(inlineStyleCount <= 55, `Inline stil sayısı yeniden yükseldi: ${inlineStyleCount}`);
});

test('Electron E2E sürücüsü üretimden izole test profili kullanır', () => {
  const main = read('main.js');
  const runner = read('scripts/e2e.js');
  assert.match(main, /process\.argv\.includes\('--e2e'\)/);
  assert.match(main, /CBP_E2E_USER_DATA/);
  assert.match(runner, /mkdtempSync/);
  assert.match(runner, /CBP_E2E_RESULT/);
});

test('modal durumu blur yarışını önlemek için ana süreç onayı bekler', () => {
  const preload = read('preload.js');
  const main = read('main.js');
  assert.match(preload, /setModalOpen: \(isOpen\) => safeInvoke\('set-modal-open'/);
  assert.match(main, /ipcMain\.handle\('set-modal-open'/);
  assert.doesNotMatch(main, /ipcMain\.on\('set-modal-open'/);
  assert.match(main, /modalProtectionUntil/);
});

test('içerik dönüşüm kuralları ana süreçten ayrılmış saf servistedir', () => {
  const content = require(path.join(root, 'lib', 'content-utils'));
  assert.equal(content.htmlToPlainText('<p>Hello<br>World</p>'), 'Hello\nWorld');
  assert.equal(content.areFormatsEqual(['png', 'text'], ['text', 'png']), true);
  assert.equal(content.areFormatsEqual(['png'], ['text']), false);
});

test('toast mesajı HTML şablonuna birleştirilmeden textContent ile yazılır', () => {
  const source = read('src/js/utils.js');
  assert.match(source, /messageElement\.textContent = String\(message\)/);
});

test('Electron E2E reload ve ekran dışı bounds toparlamasını doğrular', () => {
  const main = read('main.js');
  const runner = read('scripts/e2e.js');
  assert.match(main, /webContents\.reload\(\)/);
  assert.match(main, /boundsRecovered/);
  assert.match(runner, /reloadState/);
  assert.match(runner, /Ekran dışı pencere bounds/);
});

test('kurulum ve veri ayarları gerçek release davranışını doğru açıklar', () => {
  const html = read('src/index.html');
  const onboarding = read('src/js/onboarding.js');
  const tr = JSON.parse(read('src/locales/tr.json'));
  assert.match(html, /id="onboarding-theme"[\s\S]*?<option value="system"/);
  assert.match(onboarding, /settings\?\.globalShortcut \|\| ''\)\.trim\(\) \|\| 'Ctrl\+Shift\+V'/);
  assert.match(onboarding, /id=\"onboarding-ready\"|get\('onboarding-ready'\)/);
  assert.match(onboarding, /createElement\('kbd'\)/);
  assert.match(tr.onboarding.readyDesc, /\{\{shortcut\}\}/);
  assert.match(tr.settings.exportDesc, /\.cpbackup/);
  assert.match(tr.settings.importDesc, /mevcut içeriğe ekleyin/);
  assert.doesNotMatch(tr.settings.portableDesc, /zero-trace|sıfır iz/i);
});

test('HTML çeviri anahtarları bütün dil dosyalarında tanımlıdır', () => {
  const html = read('src/index.html');
  const keys = new Set();
  for (const match of html.matchAll(/data-i18n="([^"]+)"/g)) {
    const expression = match[1];
    const key = expression.includes(']')
      ? expression.slice(expression.indexOf(']') + 1)
      : expression;
    if (key) keys.add(key);
  }

  function hasPath(object, dottedPath) {
    return dottedPath.split('.').every((part) => {
      if (!object || !Object.prototype.hasOwnProperty.call(object, part)) return false;
      object = object[part];
      return true;
    });
  }

  for (const language of ['tr', 'en', 'zh', 'pt-BR']) {
    const locale = JSON.parse(read(`src/locales/${language}.json`));
    const missing = [...keys].filter((key) => !hasPath(locale, key));
    assert.deepEqual(missing, [], `${language} dilinde eksik anahtarlar var`);
  }
});

test('i18n yalnızca varsayılan İngilizce dile fallback yapar', () => {
  const source = read('src/js/i18n.js');
  assert.match(source, /resolve\(translations\[DEFAULT_LANG\], key\)/);
  assert.doesNotMatch(source, /resolve\(translations\['tr'\], key\)/);
  assert.doesNotMatch(source, /resolve\(translations\['zh'\], key\)/);
  assert.doesNotMatch(source, /resolve\(translations\['pt-BR'\], key\)/);
});

test('dil yalnızca ayar kalıcı olarak kaydedilirse arayüze uygulanır', () => {
  const source = read('src/js/settings.js');
  assert.match(source, /const saved = await saveSetting\('language', lang, false\)/);
  assert.match(source, /if \(!saved\)[\s\S]*?e\.target\.value = window\.i18n\?\.getLanguage\(\) \|\| 'en'/);
  assert.match(source, /if \(!saved\)[\s\S]*?return;[\s\S]*?window\.i18n\.setLanguage\(lang\)/);
});
