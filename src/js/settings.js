/* ═══════════════════════════════════════════════════════════════
   ClipBoard Prime — Settings Module
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const SettingsPanel = (() => {
  const elements = {
    modal: document.getElementById('settings-modal'),
    closeBtn: document.getElementById('settings-close-btn'),
    footerCloseBtn: document.getElementById('settings-footer-close-btn'),
    tabs: document.querySelectorAll('.settings-tab'),
    sections: document.querySelectorAll('.settings-section'),
    
    // Form Inputs
    theme: document.getElementById('setting-theme'),
    autostart: document.getElementById('setting-autostart'),
    sensitive: document.getElementById('setting-sensitive'),
    historyLimit: document.getElementById('setting-history-limit'),
    pollInterval: document.getElementById('setting-poll-interval'),
    shortcut: document.getElementById('setting-shortcut'),
    blurToTray: document.getElementById('setting-blur-to-tray'),
    appFontSize: document.getElementById('setting-app-font-size'),
    language: document.getElementById('setting-language'),
    
    // Data Actions
    locationPath: document.getElementById('data-location-path'),
    changeLocationBtn: document.getElementById('change-data-location-btn'),
    exportBtn: document.getElementById('export-data-btn'),
    importBtn: document.getElementById('import-data-btn'),
  };

  let currentSettings = {};
  let isPortableMode = false;

  /**
   * Modülü başlatır ve olay dinleyicilerini kurar
   */
  async function init() {
    setupEventListeners();
    await loadSettings();
  }

  /**
   * Olay dinleyicilerini tanımlar
   */
  function setupEventListeners() {
    // Kapatma butonları
    elements.closeBtn.addEventListener('click', () => closeSettingsModal());
    elements.footerCloseBtn.addEventListener('click', () => closeSettingsModal());

    // Boşluğa tıklayarak kapatma
    elements.modal.addEventListener('click', (e) => {
      if (e.target === elements.modal) closeSettingsModal();
    });

    // Tab geçişleri
    elements.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        elements.tabs.forEach(t => t.classList.remove('active'));
        elements.sections.forEach(s => s.classList.remove('active'));

        tab.classList.add('active');
        const targetSection = document.getElementById(`settings-${tab.dataset.tab}`);
        if (targetSection) targetSection.classList.add('active');
      });
    });

    // ─── Ayarların Değişimi Kayıt Dinleyicileri ───
    elements.theme.addEventListener('change', (e) => saveSetting('theme', e.target.value));
    elements.autostart.addEventListener('change', (e) => saveSetting('startWithWindows', String(e.target.checked)));
    elements.sensitive.addEventListener('change', (e) => saveSetting('detectSensitive', String(e.target.checked)));
    elements.historyLimit.addEventListener('change', (e) => saveSetting('maxHistory', e.target.value));
    elements.pollInterval.addEventListener('change', (e) => saveSetting('pollingInterval', e.target.value));
    if (elements.blurToTray) {
      elements.blurToTray.addEventListener('change', (e) => saveSetting('blurToTray', String(e.target.checked)));
    }
    elements.appFontSize.addEventListener('change', (e) => {
      saveSetting('appFontSize', e.target.value);
      applyFontSizes(e.target.value);
    });
    if (elements.language) {
      elements.language.addEventListener('change', async (e) => {
        const lang = e.target.value;
        await saveSetting('language', lang, false); // false = don't show "setting saved" toast for language
        if (window.i18n) {
          await window.i18n.setLanguage(lang);
          updateFontSizeLabels();
          // Refresh dynamic JS-rendered parts
          if (window.ClipboardPanel) window.ClipboardPanel.loadHistory(false);
          if (window.NotesPanel) {
            await window.NotesPanel.loadCategories();
            window.NotesPanel.loadNotes();
          }
          if (window.App) window.App.updateStatusBar();
        }
      });
    }

    // ─── Veri Ayarları Dinleyicileri ───
    elements.changeLocationBtn.addEventListener('click', () => changeDataLocation());
    elements.exportBtn.addEventListener('click', () => exportData());
    elements.importBtn.addEventListener('click', () => importData());

    // ─── Hakkında Bağlantıları Dinleyicileri ───
    document.querySelectorAll('.about-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.dataset.url;
        if (url) {
          window.api.openExternal(url);
        }
      });
    });

    // Main process'ten ayar değişimi olaylarını dinle (örn. arka planda güncellenirse)
    window.api.onSettingsChanged(({ key, value }) => {
      currentSettings[key] = value;
      updateUIField(key, value);
    });

    // Sistem teması değişikliklerini canlı olarak dinle
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentSettings.theme === 'system') {
        applyTheme('system');
      }
    });

    // ─── Kısayol Düzenleme Mantığı ───
    let isListeningShortcut = false;

    elements.shortcut.addEventListener('focus', () => {
      isListeningShortcut = true;
      elements.shortcut.style.borderColor = 'var(--accent-primary)';
      elements.shortcut.style.boxShadow = '0 0 0 3px var(--accent-subtle)';
      elements.shortcut.value = window.i18n ? window.i18n.t('settings.shortcutListening') : 'Kombinasyona bas...';
    });

    elements.shortcut.addEventListener('blur', () => {
      isListeningShortcut = false;
      elements.shortcut.style.borderColor = '';
      elements.shortcut.style.boxShadow = '';
      elements.shortcut.value = currentSettings.globalShortcut || 'Ctrl+Shift+V';
    });

    elements.shortcut.addEventListener('keydown', (e) => {
      if (!isListeningShortcut) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        elements.shortcut.blur();
        return;
      }

      const modifiers = [];
      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.metaKey) modifiers.push('Meta');

      const key = e.key;
      const isModifierKey = ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(key);

      if (!isModifierKey) {
        let keyName = key;
        // Harfleri büyüt
        if (keyName.length === 1) {
          keyName = keyName.toUpperCase();
        } else {
          // Özel tuşları normalize et
          if (keyName === ' ') keyName = 'Space';
          else if (keyName === 'ArrowUp') keyName = 'Up';
          else if (keyName === 'ArrowDown') keyName = 'Down';
          else if (keyName === 'ArrowLeft') keyName = 'Left';
          else if (keyName === 'ArrowRight') keyName = 'Right';
        }

        if (modifiers.length > 0) {
          const shortcutString = `${modifiers.join('+')}+${keyName}`;
          elements.shortcut.value = shortcutString;
          
          saveSetting('globalShortcut', shortcutString);
          elements.shortcut.blur();
        }
      }
    });
  }


  /**
   * Ayarları yükler ve UI'ı doldurur
   */
  async function loadSettings() {
    try {
      let settingsData = window.App && window.App.settings;
      if (!settingsData) {
        const response = await window.api.getSettings();
        if (response && response.success) {
          settingsData = response.data;
        }
      }

      if (settingsData) {
        currentSettings = settingsData;

        // i18n motorunu başlat (dil ayarını yükle)
        if (window.i18n) {
          const savedLang = currentSettings.language || null;
          await window.i18n.init(savedLang);
          // Dil select'ini güncelle
          if (elements.language) {
            elements.language.value = window.i18n.getLanguage();
          }
          updateFontSizeLabels();
        }
        
        // UI alanlarını doldur
        elements.theme.value = currentSettings.theme || 'dark';
        elements.autostart.checked = currentSettings.startWithWindows === 'true' || currentSettings.startWithWindows === undefined || currentSettings.startWithWindows === null || currentSettings.startWithWindows === '';
        elements.sensitive.checked = currentSettings.detectSensitive === 'true';
        elements.historyLimit.value = currentSettings.maxHistory || '0';
        elements.pollInterval.value = currentSettings.pollingInterval || '500';
        elements.shortcut.value = currentSettings.globalShortcut || 'Ctrl+Shift+V';
        if (elements.blurToTray) {
          elements.blurToTray.checked = currentSettings.blurToTray === 'true';
        }
        elements.appFontSize.value = currentSettings.appFontSize || '13px';

        // Temayı uygula
        applyTheme(currentSettings.theme);
        applyFontSizes(currentSettings.appFontSize);

        // Veritabanı konumunu ve istatistikleri al
        await refreshLocationPath();

        // Uygulama bilgilerini çek ve Hakkında sekmesini doldur
        if (window.api && window.api.getAppInfo) {
          const infoRes = await window.api.getAppInfo();
          if (infoRes && infoRes.success) {
            const appInfo = infoRes.data;
            isPortableMode = !!appInfo.isPortable;

            const titleEl = document.getElementById('about-app-title');
            const versionEl = document.getElementById('about-app-version');
            const authorEl = document.getElementById('about-app-author');
            const devLinkEl = document.getElementById('about-dev-link');
            const sourceLinkEl = document.getElementById('about-source-link');

            if (titleEl) titleEl.textContent = appInfo.name;
            if (versionEl) versionEl.textContent = window.i18n
              ? window.i18n.t('settings.version', { version: appInfo.version })
              : `Sürüm ${appInfo.version}`;
            if (authorEl) authorEl.textContent = `${appInfo.author}`;
            if (devLinkEl) devLinkEl.dataset.url = 'https://github.com/MaximusPrime77';
            if (sourceLinkEl) sourceLinkEl.dataset.url = 'https://github.com/MaximusPrime77/ClipBoardPrime';

            // Taşınabilir (Portable) Sürüm
            if (isPortableMode) {
              const i = window.i18n;
              elements.changeLocationBtn.disabled = true;
              elements.changeLocationBtn.classList.add('disabled');
              elements.changeLocationBtn.setAttribute('title', i ? i.t('settings.portableLocked') : 'Portable sürümde veri konumu değiştirilemez.');
              elements.changeLocationBtn.innerHTML = `
                <svg class="icon-svg" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                ${i ? i.t('settings.portableLocked') : 'Portable Modda Kilitli'}
              `;

              const locationContainer = elements.changeLocationBtn.parentElement;
              if (locationContainer) {
                locationContainer.style.display = 'none';

                const parentElement = locationContainer.parentElement;
                if (parentElement && !document.getElementById('portable-warning-box')) {
                  const warningBox = document.createElement('div');
                  warningBox.id = 'portable-warning-box';
                  warningBox.className = 'portable-info-box';
                  warningBox.innerHTML = `
                    <div class="portable-info-icon">
                      <svg class="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    </div>
                    <div class="portable-info-text">
                      <strong>${i ? i.t('settings.portableTitle') : 'Taşınabilir (Portable) Sürüm Aktif'}</strong>
                      <span>${i ? i.t('settings.portableDesc') : 'Verileriniz taşınabilirlik ve sıfır iz için her zaman uygulama dizinindeki <code>/data</code> klasöründe saklanır.'}</span>
                    </div>
                  `;
                  parentElement.appendChild(warningBox);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('loadSettings hatası:', err);
    }
  }

  /**
   * Tek bir ayarı veritabanına kaydeder
   */
  async function saveSetting(key, value, showToast = true) {
    try {
      const response = await window.api.saveSetting(key, value);
      if (response && response.success) {
        currentSettings[key] = value;
        if (showToast) {
          Utils.showToast(window.i18n ? window.i18n.t('toast.settingSaved') : 'Ayar kaydedildi', 'success');
        }
        // Tema ayarı değiştiyse anında uygula
        if (key === 'theme') {
          applyTheme(value);
        }
      } else {
        Utils.showToast((window.i18n ? window.i18n.t('toast.settingFailed') : 'Ayar kaydedilemedi') + ': ' + response?.error, 'error');
      }
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Dışarıdan tetiklenen ayar güncellemelerinde UI alanını senkronize eder
   */
  function updateUIField(key, value) {
    if (key === 'theme') elements.theme.value = value;
    else if (key === 'startWithWindows') elements.autostart.checked = value === 'true';
    else if (key === 'detectSensitive') elements.sensitive.checked = value === 'true';
    else if (key === 'maxHistory') elements.historyLimit.value = value;
    else if (key === 'pollingInterval') elements.pollInterval.value = value;
    else if (key === 'globalShortcut') elements.shortcut.value = value;
    else if (key === 'blurToTray' && elements.blurToTray) elements.blurToTray.checked = value === 'true';
    else if (key === 'appFontSize') {
      elements.appFontSize.value = value;
      applyFontSizes(value);
    }
    else if (key === 'language' && elements.language) {
      elements.language.value = value;
    }
  }

  /**
   * Font size select element'inin seçeneklerini mevcut dile göre günceller
   */
  function updateFontSizeLabels() {
    if (!elements.appFontSize || !window.i18n) return;
    const sizes = [
      { value: '12px', key: 'settings.fontSmall' },
      { value: '13px', key: 'settings.fontDefault' },
      { value: '14px', key: 'settings.fontMedium' },
      { value: '15px', key: 'settings.fontLarge' },
      { value: '16px', key: 'settings.fontXLarge' },
      { value: '18px', key: 'settings.fontXXLarge' }
    ];

    Array.from(elements.appFontSize.options).forEach((option) => {
      const sizeObj = sizes.find(s => s.value === option.value);
      if (sizeObj) {
        option.textContent = `${sizeObj.value} (${window.i18n.t(sizeObj.key)})`;
      }
    });
  }

  /**
   * Seçilen yazı boyutlarını HTML belgesine uygular
   */
  function applyFontSizes(size) {
    const fSize = size || '13px';
    document.documentElement.style.setProperty('--font-size-app', fSize);
    document.documentElement.style.setProperty('--font-size-note', fSize);
  }

  /**
   * Seçilen temayı HTML belgesine uygular
   */
  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
      html.setAttribute('data-theme', theme || 'dark');
    }
  }

  /**
   * Veritabanı konumunu güncelleyip ekranda gösterir
   */
  async function refreshLocationPath() {
    try {
      const statsResponse = await window.api.getStats();
      if (statsResponse && statsResponse.success) {
        const dbPath = statsResponse.data.database.path;
        elements.locationPath.textContent = dbPath;
        elements.locationPath.title = dbPath;
      }
    } catch (err) {
      elements.locationPath.textContent = window.i18n ? window.i18n.t('settings.dbLocationReadError') : 'Konum okunamadı';
    }
  }

  /**
   * Veritabanı konumunu değiştirmeyi tetikler
   */
  async function changeDataLocation() {
    if (isPortableMode) {
      Utils.showToast(window.i18n ? window.i18n.t('toast.portableNoLocation') : 'Portable sürümde veri konumu değiştirilemez.', 'error');
      return;
    }

    const confirmed = await window.App.confirm(
      window.i18n ? window.i18n.t('confirm.changeLocationTitle') : 'Veri Konumunu Taşı',
      window.i18n ? window.i18n.t('confirm.changeLocationMsg') : 'Veritabanı konumunu değiştirmek ve mevcut verilerinizi yeni konuma kopyalamak istediğinize emin misiniz?',
      Utils.Icons.settings
    );

    if (!confirmed) return;

    try {
      const response = await window.api.selectDataLocation();
      if (response && response.success) {
        Utils.showToast(window.i18n ? window.i18n.t('toast.locationMoved') : 'Veritabanı konumu başarıyla taşındı.', 'success');
        await refreshLocationPath();
        
        if (window.ClipboardPanel) window.ClipboardPanel.loadHistory(false);
        if (window.NotesPanel) {
          window.NotesPanel.loadCategories();
          window.NotesPanel.loadNotes();
        }
      } else if (response && response.error !== 'İptal edildi') {
        Utils.showToast((window.i18n ? window.i18n.t('toast.locationMoveFailed') : 'Taşıma başarısız') + ': ' + response.error, 'error');
      }
    } catch (err) {
      console.error(err);
      Utils.showToast(window.i18n ? window.i18n.t('toast.locationMoveError') : 'İşlem sırasında bir hata oluştı', 'error');
    }
  }

  /**
   * Verileri JSON olarak dışa aktarır
   */
  async function exportData() {
    const password = await window.App.prompt(
      window.i18n ? window.i18n.t('backup.exportPasswordTitle') : 'Yedek Parolası',
      window.i18n ? window.i18n.t('backup.exportPasswordMsg') : 'Yedeği korumak için en az 8 karakterli bir parola belirleyin.',
      { type: 'password', minLength: 8 }
    );
    if (!password) return;

    const confirmation = await window.App.prompt(
      window.i18n ? window.i18n.t('backup.confirmPasswordTitle') : 'Parolayı Doğrulayın',
      window.i18n ? window.i18n.t('backup.confirmPasswordMsg') : 'Aynı parolayı yeniden girin.',
      { type: 'password', minLength: 8 }
    );
    if (!confirmation) return;
    if (password !== confirmation) {
      Utils.showToast(window.i18n ? window.i18n.t('backup.passwordMismatch') : 'Parolalar eşleşmiyor.', 'error');
      return;
    }

    try {
      const response = await window.api.exportData(password);
      if (response && response.success) {
        Utils.showToast(window.i18n ? window.i18n.t('toast.exportSuccess') : 'Veriler başarıyla yedeklendi.', 'success');
      } else if (response && response.error !== 'İptal edildi') {
        Utils.showToast((window.i18n ? window.i18n.t('toast.exportFailed') : 'Dışa aktarma hatası') + ': ' + response.error, 'error');
      }
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * JSON yedeğinden verileri içe aktarır
   */
  async function importData() {
    const confirmed = await window.App.confirm(
      window.i18n ? window.i18n.t('confirm.importDataTitle') : 'Veriyi İçe Aktar',
      window.i18n ? window.i18n.t('confirm.importDataMsg') : 'Seçilen yedek dosyasındaki veriler mevcut veritabanınıza eklenecektir. Devam etmek istiyor musunuz?',
      Utils.Icons.download
    );

    if (!confirmed) return;

    const password = await window.App.prompt(
      window.i18n ? window.i18n.t('backup.importPasswordTitle') : 'Yedek Parolası',
      window.i18n ? window.i18n.t('backup.importPasswordMsg') : 'Şifreli yedek parolasını girin. Eski JSON yedekleri için herhangi bir değer girebilirsiniz.',
      { type: 'password', minLength: 1 }
    );
    if (!password) return;

    try {
      const response = await window.api.importData(password);
      if (response && response.success) {
        const res = response.data;
        Utils.showToast(
          window.i18n
            ? window.i18n.t('toast.importSuccess', { clipboard: res.clipboard_history, notes: res.notes })
            : `İçe aktarma başarılı! (${res.clipboard_history} pano, ${res.notes} not eklendi)`,
          'success'
        );
        
        if (window.ClipboardPanel) window.ClipboardPanel.loadHistory(false);
        if (window.NotesPanel) {
          await window.NotesPanel.loadCategories();
          window.NotesPanel.loadNotes();
        }
      } else if (response && response.error !== 'İptal edildi') {
        Utils.showToast((window.i18n ? window.i18n.t('toast.importFailed') : 'İçe aktarma hatası') + ': ' + response.error, 'error');
      }
    } catch (err) {
      console.error(err);
      Utils.showToast(window.i18n ? window.i18n.t('toast.importReadFailed') : 'Dosya okuma veya yazma hatası oluştu', 'error');
    }
  }

  function openSettingsModal() {
    elements.modal.classList.add('active');
    Utils.initFocusTrap(elements.modal);
    
    // İlk sekme varsayılan aktif
    elements.tabs[0].click();
  }

  function closeSettingsModal() {
    elements.modal.classList.remove('active');
    Utils.destroyFocusTrap(elements.modal);
  }

  return {
    init,
    openSettingsModal,
    closeSettingsModal,
    applyTheme,
  };
})();

window.SettingsPanel = SettingsPanel;

