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
    adminStatus: document.getElementById('setting-admin-status'),
    restartAsAdminBtn: document.getElementById('restart-as-admin-btn'),
    sensitive: document.getElementById('setting-sensitive'),
    historyLimit: document.getElementById('setting-history-limit'),
    retentionDays: document.getElementById('setting-retention-days'),
    retentionKeepFavorites: document.getElementById('setting-retention-keep-favorites'),
    retentionTypeInputs: document.querySelectorAll('[data-retention-type]'),
    pollInterval: document.getElementById('setting-poll-interval'),
    shortcut: document.getElementById('setting-shortcut'),
    notesShortcut: document.getElementById('setting-notes-shortcut'),
    blurToTray: document.getElementById('setting-blur-to-tray'),
    clearSearchOnHide: document.getElementById('setting-clear-search-on-hide'),
    clearNotesSearchOnHide: document.getElementById('setting-clear-notes-search-on-hide'),
    hideAfterPaste: document.getElementById('setting-hide-after-paste'),
    windowOpenPosition: document.getElementById('setting-window-open-position'),
    clipboardOpenFilter: document.getElementById('setting-clipboard-open-filter'),
    notesOpenFilter: document.getElementById('setting-notes-open-filter'),
    quickActionInputs: document.querySelectorAll('[data-quick-action]'),
    quickActionList: document.getElementById('quick-action-settings-list'),
    workspaceOpenMode: document.getElementById('setting-workspace-open-mode'),
    resetWindowBoundsBtn: document.getElementById('reset-window-bounds-btn'),
    spaceKeyAction: document.getElementById('setting-space-key-action'),
    clipboardClickOpensPreview: document.getElementById('setting-clipboard-click-opens-preview'),
    clipboardDoubleClickPaste: document.getElementById('setting-clipboard-double-click-paste'),
    noteContentClickOpensModal: document.getElementById('setting-note-content-click-opens-modal'),
    noteDoubleClickOpensModal: document.getElementById('setting-note-double-click-opens-modal'),
    keyboardHelp: document.getElementById('setting-keyboard-help'),
    appFontSize: document.getElementById('setting-app-font-size'),
    language: document.getElementById('setting-language'),
    
    // Data Actions
    locationPath: document.getElementById('data-location-path'),
    changeLocationBtn: document.getElementById('change-data-location-btn'),
    exportBtn: document.getElementById('export-data-btn'),
    importBtn: document.getElementById('import-data-btn'),
    openOnboardingBtn: document.getElementById('open-onboarding-btn'),
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
    // Tab geçişleri
    elements.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        elements.tabs.forEach((t) => {
          const active = t === tab;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', String(active));
        });
        elements.sections.forEach(s => s.classList.remove('active'));

        const targetSection = document.getElementById(`settings-${tab.dataset.tab}`);
        if (targetSection) targetSection.classList.add('active');
      });
    });

    // ─── Ayarların Değişimi Kayıt Dinleyicileri ───
    elements.theme.addEventListener('change', (e) => saveSetting('theme', e.target.value));
    elements.autostart.addEventListener('change', (e) => saveSetting('startWithWindows', String(e.target.checked)));
    elements.restartAsAdminBtn?.addEventListener('click', restartAsAdministrator);
    elements.sensitive.addEventListener('change', (e) => saveSetting('detectSensitive', String(e.target.checked)));
    elements.historyLimit.addEventListener('change', (e) => saveSetting('maxHistory', e.target.value));
    elements.retentionDays?.addEventListener('change', (e) => saveSetting('retentionDays', e.target.value));
    elements.retentionKeepFavorites?.addEventListener('change', (e) => {
      saveSetting('retentionKeepFavorites', String(e.target.checked));
    });
    setupRetentionTypeSettings();
    elements.pollInterval.addEventListener('change', (e) => saveSetting('pollingInterval', e.target.value));
    if (elements.blurToTray) {
      elements.blurToTray.addEventListener('change', (e) => saveSetting('blurToTray', String(e.target.checked)));
    }
    if (elements.clearSearchOnHide) {
      elements.clearSearchOnHide.addEventListener('change', (e) => saveSetting('clearSearchOnHide', String(e.target.checked)));
    }
    elements.clearNotesSearchOnHide?.addEventListener('change', (e) => saveSetting('clearNotesSearchOnHide', String(e.target.checked)));
    elements.hideAfterPaste?.addEventListener('change', (e) => saveSetting('hideAfterPaste', String(e.target.checked)));
    if (elements.windowOpenPosition) {
      elements.windowOpenPosition.addEventListener('change', (e) => saveSetting('windowOpenPosition', e.target.value));
    }
    if (elements.clipboardOpenFilter) {
      elements.clipboardOpenFilter.addEventListener('change', (e) => saveSetting('clipboardOpenFilter', e.target.value));
    }
    if (elements.notesOpenFilter) {
      elements.notesOpenFilter.addEventListener('change', (e) => saveSetting('notesOpenFilter', e.target.value));
    }
    elements.quickActionInputs.forEach((input) => {
      input.addEventListener('change', () => {
        const selected = getOrderedQuickActionInputs()
          .filter((candidate) => candidate.checked)
          .map((candidate) => candidate.dataset.quickAction);
        saveSetting('clipboardQuickActions', JSON.stringify(selected));
      });
    });
    setupQuickActionSorting();
    if (elements.workspaceOpenMode) {
      elements.workspaceOpenMode.addEventListener('change', async (e) => {
        const mode = e.target.value;
        await saveSetting('workspaceOpenMode', mode);
        if (mode !== 'last') await window.App?.setWorkspaceMode(mode, true);
      });
    }
    elements.resetWindowBoundsBtn?.addEventListener('click', resetWindowBounds);
    if (elements.spaceKeyAction) {
      elements.spaceKeyAction.addEventListener('change', (e) => saveSetting('spaceKeyAction', e.target.value));
    }
    if (elements.clipboardClickOpensPreview) {
      elements.clipboardClickOpensPreview.addEventListener('change', (e) => {
        saveSetting('clipboardClickOpensPreview', String(e.target.checked));
      });
    }
    if (elements.clipboardDoubleClickPaste) {
      elements.clipboardDoubleClickPaste.addEventListener('change', (e) => {
        saveSetting('clipboardDoubleClickPaste', String(e.target.checked));
      });
    }
    if (elements.noteContentClickOpensModal) {
      elements.noteContentClickOpensModal.addEventListener('change', (e) => {
        saveSetting('noteContentClickOpensModal', String(e.target.checked));
      });
    }
    if (elements.noteDoubleClickOpensModal) {
      elements.noteDoubleClickOpensModal.addEventListener('change', (e) => {
        saveSetting('noteDoubleClickOpensModal', String(e.target.checked));
      });
    }
    if (elements.keyboardHelp) {
      elements.keyboardHelp.addEventListener('change', (e) => {
        saveSetting('showKeyboardHelp', String(e.target.checked));
        window.App?.applyKeyboardHelpVisibility?.();
      });
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
    elements.openOnboardingBtn?.addEventListener('click', () => {
      closeSettingsModal();
      window.Onboarding?.open(true);
    });

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
      if (window.App && window.App.settings) {
        window.App.settings[key] = value;
      }
      updateUIField(key, value);
    });

    // Sistem teması değişikliklerini canlı olarak dinle
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentSettings.theme === 'system') {
        applyTheme('system');
      }
    });

    // ─── Kısayol Düzenleme Mantığı (pano + notlar) ───
    setupShortcutCapture(elements.shortcut, {
      settingKey: 'globalShortcut',
      fallback: 'Ctrl+Shift+V',
      getCurrent: () => currentSettings.globalShortcut || 'Ctrl+Shift+V',
    });
    setupShortcutCapture(elements.notesShortcut, {
      settingKey: 'notesGlobalShortcut',
      fallback: 'Ctrl+Shift+N',
      getCurrent: () => currentSettings.notesGlobalShortcut || 'Ctrl+Shift+N',
    });
  }

  function setupShortcutCapture(input, { settingKey, fallback, getCurrent }) {
    if (!input) return;
    let isListening = false;

    input.addEventListener('focus', () => {
      isListening = true;
      input.classList.add('is-capturing');
      input.value = window.i18n ? window.i18n.t('settings.shortcutListening') : 'Kombinasyona bas...';
    });

    input.addEventListener('blur', () => {
      isListening = false;
      input.classList.remove('is-capturing');
      input.value = getCurrent() || fallback;
    });

    input.addEventListener('keydown', (e) => {
      if (!isListening) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        input.blur();
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
        if (keyName.length === 1) {
          keyName = keyName.toUpperCase();
        } else if (keyName === ' ') keyName = 'Space';
        else if (keyName === 'ArrowUp') keyName = 'Up';
        else if (keyName === 'ArrowDown') keyName = 'Down';
        else if (keyName === 'ArrowLeft') keyName = 'Left';
        else if (keyName === 'ArrowRight') keyName = 'Right';

        if (modifiers.length > 0) {
          const shortcutString = `${modifiers.join('+')}+${keyName}`;
          input.value = shortcutString;
          saveSetting(settingKey, shortcutString);
          input.blur();
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
        // Opt-in autostart: only explicit 'true' enables the toggle
        elements.autostart.checked = currentSettings.startWithWindows === 'true';
        await refreshPrivilegeStatus();
        elements.sensitive.checked = currentSettings.detectSensitive === 'true';
        elements.historyLimit.value = currentSettings.maxHistory || '0';
        if (elements.retentionDays) {
          elements.retentionDays.value = currentSettings.retentionDays || '0';
        }
        if (elements.retentionKeepFavorites) {
          elements.retentionKeepFavorites.checked = currentSettings.retentionKeepFavorites !== 'false';
        }
        applyRetentionTypeRules(currentSettings.retentionTypeRules);
        elements.pollInterval.value = currentSettings.pollingInterval || '500';
        elements.shortcut.value = currentSettings.globalShortcut || 'Ctrl+Shift+V';
        if (elements.notesShortcut) {
          elements.notesShortcut.value = currentSettings.notesGlobalShortcut || 'Ctrl+Shift+N';
        }
        if (elements.blurToTray) {
          elements.blurToTray.checked = currentSettings.blurToTray === 'true';
        }
        if (elements.clearSearchOnHide) {
          elements.clearSearchOnHide.checked = currentSettings.clearSearchOnHide === 'true';
        }
        if (elements.clearNotesSearchOnHide) {
          elements.clearNotesSearchOnHide.checked = currentSettings.clearNotesSearchOnHide === 'true';
        }
        if (elements.hideAfterPaste) {
          elements.hideAfterPaste.checked = currentSettings.hideAfterPaste !== 'false';
        }
        if (elements.windowOpenPosition) {
          elements.windowOpenPosition.value = currentSettings.windowOpenPosition || 'remember';
        }
        if (elements.clipboardOpenFilter) {
          elements.clipboardOpenFilter.value = currentSettings.clipboardOpenFilter || 'preserve';
        }
        await populateNotesOpenFilter(currentSettings.notesOpenFilter || 'preserve');
        applyQuickActionSettings(currentSettings.clipboardQuickActions);
        applyQuickActionOrder(currentSettings.clipboardQuickActionOrder);
        if (elements.workspaceOpenMode) {
          const openMode = currentSettings.workspaceOpenMode;
          elements.workspaceOpenMode.value = ['clipboard', 'notes'].includes(openMode) ? openMode : 'last';
        }
        if (elements.spaceKeyAction) {
          elements.spaceKeyAction.value = currentSettings.spaceKeyAction || 'copy';
        }
        // Legacy expandedClickOpensModal → yeni ayrı toggle'lara bir kez taşı
        await migrateInteractionSettings(currentSettings);
        if (elements.clipboardClickOpensPreview) {
          elements.clipboardClickOpensPreview.checked = currentSettings.clipboardClickOpensPreview !== 'false';
        }
        if (elements.clipboardDoubleClickPaste) {
          elements.clipboardDoubleClickPaste.checked = currentSettings.clipboardDoubleClickPaste !== 'false';
        }
        if (elements.noteContentClickOpensModal) {
          elements.noteContentClickOpensModal.checked = currentSettings.noteContentClickOpensModal !== 'false';
        }
        if (elements.noteDoubleClickOpensModal) {
          elements.noteDoubleClickOpensModal.checked = currentSettings.noteDoubleClickOpensModal === 'true';
        }
        if (elements.keyboardHelp) {
          elements.keyboardHelp.checked = currentSettings.showKeyboardHelp !== 'false';
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
            const sourceLinkEl = document.getElementById('about-source-link');

            if (titleEl) titleEl.textContent = appInfo.name;
            if (versionEl) versionEl.textContent = window.i18n
              ? window.i18n.t('settings.version', { version: appInfo.version })
              : `Sürüm ${appInfo.version}`;
            if (authorEl) authorEl.textContent = `${appInfo.author}`;
            const studioLinkEl = document.getElementById('about-studio-link');
            if (studioLinkEl) studioLinkEl.dataset.url = 'https://maximusprimesoftware.pages.dev/';
            if (sourceLinkEl) sourceLinkEl.dataset.url = 'https://github.com/MaximusPrimeSoftware/ClipBoardPrime';

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
                locationContainer.classList.add('hidden');

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
   * Eski tek toggle (expandedClickOpensModal) → pano/not ayrı toggle'lara taşı.
   */
  async function migrateInteractionSettings(settings) {
    if (!settings || settings.interactionSettingsMigrated === 'true') return;
    const legacyOff = settings.expandedClickOpensModal === 'false';
    if (legacyOff) {
      settings.clipboardClickOpensPreview = 'false';
      settings.noteContentClickOpensModal = 'false';
      await saveSetting('clipboardClickOpensPreview', 'false', false);
      await saveSetting('noteContentClickOpensModal', 'false', false);
    }
    settings.interactionSettingsMigrated = 'true';
    await saveSetting('interactionSettingsMigrated', 'true', false);
    if (window.App?.settings) {
      window.App.settings.interactionSettingsMigrated = 'true';
      if (legacyOff) {
        window.App.settings.clipboardClickOpensPreview = 'false';
        window.App.settings.noteContentClickOpensModal = 'false';
      }
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
        if (window.App?.settings) window.App.settings[key] = value;
        if (showToast) {
          Utils.showToast(window.i18n ? window.i18n.t('toast.settingSaved') : 'Ayar kaydedildi', 'success');
        }
        // Tema ayarı değiştiyse anında uygula
        if (key === 'theme') {
          applyTheme(value);
          window.App?.updateThemeToggleIcon?.(value);
        }
        if (key === 'showKeyboardHelp') {
          window.App?.applyKeyboardHelpVisibility?.();
        }
      } else {
        // Sessiz kayıtlar (migrasyon vb.) kullanıcıya kırmızı toast basmasın
        const msg = (window.i18n ? window.i18n.t('toast.settingFailed') : 'Ayar kaydedilemedi') + ': ' + (response?.error || '');
        if (showToast) {
          Utils.showToast(msg, 'error');
        } else {
          console.warn('[settings]', key, response?.error || msg);
        }
      }
    } catch (err) {
      console.error(err);
      if (showToast) {
        Utils.showToast(window.i18n ? window.i18n.t('toast.settingFailed') : 'Ayar kaydedilemedi', 'error');
      }
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
    else if (key === 'retentionDays' && elements.retentionDays) elements.retentionDays.value = value;
    else if (key === 'retentionKeepFavorites' && elements.retentionKeepFavorites) {
      elements.retentionKeepFavorites.checked = value !== 'false';
    }
    else if (key === 'retentionTypeRules') applyRetentionTypeRules(value);
    else if (key === 'pollingInterval') elements.pollInterval.value = value;
    else if (key === 'globalShortcut') elements.shortcut.value = value;
    else if (key === 'notesGlobalShortcut' && elements.notesShortcut) elements.notesShortcut.value = value;
    else if (key === 'blurToTray' && elements.blurToTray) elements.blurToTray.checked = value === 'true';
    else if (key === 'clearSearchOnHide' && elements.clearSearchOnHide) elements.clearSearchOnHide.checked = value === 'true';
    else if (key === 'clearNotesSearchOnHide' && elements.clearNotesSearchOnHide) elements.clearNotesSearchOnHide.checked = value === 'true';
    else if (key === 'hideAfterPaste' && elements.hideAfterPaste) elements.hideAfterPaste.checked = value !== 'false';
    else if (key === 'windowOpenPosition' && elements.windowOpenPosition) elements.windowOpenPosition.value = value;
    else if (key === 'clipboardOpenFilter' && elements.clipboardOpenFilter) elements.clipboardOpenFilter.value = value;
    else if (key === 'notesOpenFilter' && elements.notesOpenFilter) {
      populateNotesOpenFilter(value);
    }
    else if (key === 'clipboardQuickActions') {
      applyQuickActionSettings(value);
      if (window.ClipboardPanel) window.ClipboardPanel.loadHistory(false, true);
    }
    else if (key === 'clipboardQuickActionOrder') {
      applyQuickActionOrder(value);
      if (window.ClipboardPanel) window.ClipboardPanel.loadHistory(false, true);
    }
    else if (key === 'workspaceOpenMode' && elements.workspaceOpenMode) elements.workspaceOpenMode.value = value;
    else if (key === 'spaceKeyAction' && elements.spaceKeyAction) elements.spaceKeyAction.value = value;
    else if (key === 'clipboardClickOpensPreview' && elements.clipboardClickOpensPreview) {
      elements.clipboardClickOpensPreview.checked = value !== 'false';
    }
    else if (key === 'clipboardDoubleClickPaste' && elements.clipboardDoubleClickPaste) {
      elements.clipboardDoubleClickPaste.checked = value !== 'false';
    }
    else if (key === 'noteContentClickOpensModal' && elements.noteContentClickOpensModal) {
      elements.noteContentClickOpensModal.checked = value !== 'false';
    }
    else if (key === 'noteDoubleClickOpensModal' && elements.noteDoubleClickOpensModal) {
      elements.noteDoubleClickOpensModal.checked = value === 'true';
    }
    else if (key === 'showKeyboardHelp' && elements.keyboardHelp) {
      elements.keyboardHelp.checked = value !== 'false';
      window.App?.applyKeyboardHelpVisibility?.();
    }
    else if (key === 'appFontSize') {
      elements.appFontSize.value = value;
      applyFontSizes(value);
    }
    else if (key === 'language' && elements.language) {
      elements.language.value = value;
    }
  }

  async function resetWindowBounds() {
    const response = await window.api.resetWindowBounds();
    if (response?.success) {
      Utils.showToast(
        window.i18n ? window.i18n.t('toast.windowBoundsReset') : 'Pencere boyutu ve konumu sıfırlandı.',
        'success'
      );
      return;
    }
    Utils.showToast(response?.error || 'Pencere sıfırlanamadı.', 'error');
  }

  function applyQuickActionSettings(value) {
    let selected = ['copy', 'pin', 'favorite', 'note', 'delete'];
    try {
      const parsed = JSON.parse(value || '[]');
      if (Array.isArray(parsed)) selected = parsed;
    } catch (err) {
      // Keep safe defaults for legacy or manually edited settings.
    }
    elements.quickActionInputs.forEach((input) => {
      input.checked = selected.includes(input.dataset.quickAction);
    });
  }

  function getOrderedQuickActionInputs() {
    if (!elements.quickActionList) return Array.from(elements.quickActionInputs);
    return Array.from(elements.quickActionList.querySelectorAll('[data-quick-action]'));
  }

  function normalizeQuickActionOrder(value) {
    const fallback = ['copy', 'pin', 'favorite', 'note', 'delete'];
    try {
      const parsed = JSON.parse(value || '[]');
      if (!Array.isArray(parsed)) return fallback;
      return [...new Set([...parsed.filter((item) => fallback.includes(item)), ...fallback])];
    } catch {
      return fallback;
    }
  }

  function applyQuickActionOrder(value) {
    if (!elements.quickActionList) return;
    normalizeQuickActionOrder(value).forEach((action) => {
      const row = elements.quickActionList.querySelector(`[data-quick-action-row="${action}"]`);
      if (row) elements.quickActionList.appendChild(row);
    });
  }

  function setupQuickActionSorting() {
    if (!elements.quickActionList) return;
    let draggedRow = null;

    elements.quickActionList.addEventListener('dragstart', (event) => {
      const row = event.target.closest('[data-quick-action-row]');
      if (!row) return;
      draggedRow = row;
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
    });

    elements.quickActionList.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (!draggedRow) return;
      const target = event.target.closest('[data-quick-action-row]');
      if (!target || target === draggedRow) return;
      const rect = target.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      elements.quickActionList.insertBefore(
        draggedRow,
        insertAfter ? target.nextSibling : target
      );
    });

    elements.quickActionList.addEventListener('dragend', async () => {
      if (!draggedRow) return;
      draggedRow.classList.remove('dragging');
      draggedRow = null;
      const order = getOrderedQuickActionInputs().map((input) => input.dataset.quickAction);
      await saveSetting('clipboardQuickActionOrder', JSON.stringify(order), false);
      if (window.ClipboardPanel) window.ClipboardPanel.loadHistory(false, true);
    });
  }

  function setupRetentionTypeSettings() {
    const options = [
      ['0', 'settings.retentionUseGeneral', 'Genel süreyi kullan'],
      ['1', 'settings.retentionOneDay', '1 gün'],
      ['7', 'settings.retentionSevenDays', '7 gün'],
      ['30', 'settings.retentionThirtyDays', '30 gün'],
      ['90', 'settings.retentionNinetyDays', '90 gün'],
      ['365', 'settings.retentionOneYear', '1 yıl'],
    ];
    elements.retentionTypeInputs.forEach((select) => {
      select.innerHTML = options.map(([value, key, fallback]) =>
        `<option value="${value}" data-i18n="${key}">${window.i18n ? window.i18n.t(key) : fallback}</option>`
      ).join('');
      select.addEventListener('change', saveRetentionTypeRules);
    });
  }

  function applyRetentionTypeRules(value) {
    let rules = {};
    try {
      const parsed = JSON.parse(value || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) rules = parsed;
    } catch {}
    elements.retentionTypeInputs.forEach((select) => {
      select.value = String(rules[select.dataset.retentionType] || '0');
    });
  }

  function saveRetentionTypeRules() {
    const rules = {};
    elements.retentionTypeInputs.forEach((select) => {
      if (select.value !== '0') rules[select.dataset.retentionType] = Number(select.value);
    });
    saveSetting('retentionTypeRules', JSON.stringify(rules));
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
      {
        type: 'password',
        minLength: 8,
        submitLabel: window.i18n ? window.i18n.t('backup.continueToConfirm') : 'Parolayı Onayla'
      }
    );
    if (!password) return;

    const confirmation = await window.App.prompt(
      window.i18n ? window.i18n.t('backup.confirmPasswordTitle') : 'Parolayı Doğrulayın',
      window.i18n ? window.i18n.t('backup.confirmPasswordMsg') : 'Aynı parolayı yeniden girin.',
      {
        type: 'password',
        minLength: 8,
        submitLabel: window.i18n ? window.i18n.t('backup.createEncryptedBackup') : 'Şifreli Yedeği Oluştur'
      }
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
      {
        type: 'password',
        minLength: 1,
        submitLabel: window.i18n ? window.i18n.t('backup.importBackup') : 'Yedeği İçe Aktar'
      }
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

  async function populateNotesOpenFilter(selectedValue = 'preserve') {
    if (!elements.notesOpenFilter || !window.api?.getCategories) return;
    const fixedOptions = Array.from(elements.notesOpenFilter.options)
      .filter((option) => !option.dataset.dynamicCategory);
    elements.notesOpenFilter.replaceChildren(...fixedOptions);

    try {
      const response = await window.api.getCategories();
      if (response?.success) {
        response.data.forEach((category) => {
          const option = document.createElement('option');
          option.value = `category:${category.id}`;
          option.dataset.dynamicCategory = 'true';
          option.textContent = window.NotesPanel?.getLocalizedCategoryName
            ? window.NotesPanel.getLocalizedCategoryName(category.name)
            : category.name;
          elements.notesOpenFilter.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Açılış not kategorileri yüklenemedi:', error);
    }

    const hasSelectedValue = Array.from(elements.notesOpenFilter.options)
      .some((option) => option.value === selectedValue);
    elements.notesOpenFilter.value = hasSelectedValue ? selectedValue : 'all';
  }

  async function refreshPrivilegeStatus() {
    if (!elements.adminStatus || !window.api?.getPrivilegeStatus) return;
    const response = await window.api.getPrivilegeStatus();
    if (!response?.success) return;
    const status = response.data;
    elements.adminStatus.textContent = status.isAdministrator
      ? (window.i18n ? window.i18n.t('settings.adminActive') : 'Aktif')
      : (window.i18n ? window.i18n.t('settings.adminNormal') : 'Normal');
    elements.adminStatus.classList.toggle('active', status.isAdministrator);
    if (elements.restartAsAdminBtn) {
      elements.restartAsAdminBtn.disabled = status.isAdministrator || !status.canRelaunch;
      elements.restartAsAdminBtn.title = !status.canRelaunch
        ? (window.i18n ? window.i18n.t('settings.adminPackagedOnly') : 'Kurulu sürümde kullanılabilir.')
        : '';
    }
  }

  async function restartAsAdministrator() {
    const confirmed = await window.App.confirm(
      window.i18n ? window.i18n.t('settings.adminConfirmTitle') : 'Yönetici olarak yeniden başlat',
      window.i18n ? window.i18n.t('settings.adminConfirmDesc') : 'Bu özellik zorunlu değildir. Uygulama kapanacak ve Windows UAC onayı isteyecektir.',
      Utils.Icons.settings || Utils.Icons.lock
    );
    if (!confirmed) return;
    const response = await window.api.relaunchAsAdministrator();
    if (!response?.success) Utils.showToast(response?.error || 'Yeniden başlatılamadı', 'error');
  }

  async function openSettingsModal() {
    await populateNotesOpenFilter(currentSettings.notesOpenFilter || 'preserve');
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

