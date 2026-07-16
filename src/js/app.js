/* ═══════════════════════════════════════════════════════════════
   ClipBoard Pro — Main Application Coordinator
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const App = (() => {
  const elements = {
    app: document.getElementById('app'),
    resizer: document.getElementById('panel-resizer'),
    clipboardPanel: document.getElementById('clipboard-panel'),
    notesPanel: document.getElementById('notes-panel'),
    mainContent: document.querySelector('.main-content'),
    
    // Header buttons
    themeToggle: document.getElementById('theme-toggle'),
    settingsBtn: document.getElementById('settings-btn'),
    
    // Status Bar
    statusClips: document.querySelector('#status-clips span'),
    statusNotes: document.querySelector('#status-notes span'),
    statusPinned: document.querySelector('#status-pinned span'),
    
    // Confirm Dialog
    confirmDialog: document.getElementById('confirm-dialog'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmSub: document.getElementById('confirm-sub'),
    confirmIcon: document.getElementById('confirm-icon'),
    confirmOkBtn: document.getElementById('confirm-ok-btn'),
    confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
  };

  let confirmResolve = null;
  let settings = {};
  let lastActivePanel = 'clipboard';

  /**
   * Uygulamayı başlatır
   */
  async function init() {
    // 1. Ayarları tek bir asenkron I/O ile en başta çekip önbelleğe al
    try {
      if (window.api) {
        const response = await window.api.getSettings();
        if (response && response.success) {
          App.settings = response.data;
        }
      }
    } catch (err) {
      console.error('Ayarlar önbelleğe alınamadı:', err);
    }

    // 2. Ayarları Yükle ve Başlat (Tema gibi ayarların ilk yüklenmesi için)
    if (window.SettingsPanel) {
      await window.SettingsPanel.init();
    }

    // 3. Diğer panelleri başlat
    if (window.ClipboardPanel) window.ClipboardPanel.init();
    if (window.NotesPanel) window.NotesPanel.init();

    // 4. Genel UI olaylarını ve Panel Genişliğini Kur
    setupResizer();
    setupPanelSearch();
    setupTitleBarActions();
    setupKeyboardShortcuts();
    setupConfirmDialog();
    setupGlobalTooltips();
    
    // Kayıtlı panel genişliğini önbellekten anında uygula (sıfır flicker)
    loadPanelWidthFromCache();

    // Geçici stil bloğunu temizle (çakışmaları önlemek için)
    const initialStyle = document.getElementById('initial-panel-width-style');
    if (initialStyle) {
      initialStyle.remove();
    }

    // Ana içeriği yumuşak şekilde göster (Flicker engelleme)
    if (elements.mainContent) {
      elements.mainContent.style.opacity = '1';
    }
    
    // Alt durum çubuğunu doldur
    updateStatusBar();

    // Modalleri dinlemek için MutationObserver kur (blurToTray koruması)
    setupModalObserver();
  }

  /**
   * Split Panel yeniden boyutlandırma (Resizer) mantığı
   */
  function setupResizer() {
    let isResizing = false;

    elements.resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      document.body.style.cursor = 'col-resize';
      document.body.classList.add('resizing');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const mainContent = document.querySelector('.main-content');
      const containerRect = mainContent.getBoundingClientRect();
      const leftWidth = e.clientX - containerRect.left;

      // Minimum genişlik sınırlamaları (her panel en az 300px olmalı)
      if (leftWidth > 320 && leftWidth < containerRect.width - 320) {
        elements.clipboardPanel.style.width = `${leftWidth}px`;
      }
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.cursor = '';
      document.body.classList.remove('resizing');

      // Oranı hesapla ve kaydet
      const mainContent = document.querySelector('.main-content');
      const containerRect = mainContent.getBoundingClientRect();
      const currentWidth = parseInt(elements.clipboardPanel.style.width);
      if (currentWidth && containerRect.width && window.api) {
        const ratio = currentWidth / containerRect.width;
        window.api.saveSetting('leftPanelWidthRatio', String(ratio));
        // Geriye dönük uyumluluk için piksel olarak da kaydet
        window.api.saveSetting('leftPanelWidth', String(currentWidth));
      }
    });

    // Pencere yeniden boyutlandırıldığında panel oranını koru
    window.addEventListener('resize', () => {
      const widthRatio = App.settings && App.settings.leftPanelWidthRatio;
      if (widthRatio) {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          const containerRect = mainContent.getBoundingClientRect();
          const ratio = parseFloat(widthRatio);
          if (ratio > 0.1 && ratio < 0.9 && containerRect.width > 0) {
            elements.clipboardPanel.style.width = `${containerRect.width * ratio}px`;
          }
        }
      }
    });
  }

  /**
   * Kayıtlı sol panel genişliğini önbellekten yükler
   */
  function loadPanelWidthFromCache() {
    const widthRatio = App.settings && App.settings.leftPanelWidthRatio;
    if (widthRatio) {
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        const containerRect = mainContent.getBoundingClientRect();
        const ratio = parseFloat(widthRatio);
        if (ratio > 0.1 && ratio < 0.9 && containerRect.width > 0) {
          elements.clipboardPanel.style.width = `${containerRect.width * ratio}px`;
          return;
        }
      }
    }

    const width = App.settings && App.settings.leftPanelWidth;
    if (width) {
      elements.clipboardPanel.style.width = `${width}px`;
    }
  }

  /**
   * Panel bazlı arama dinleyicilerini kurar ve aktif paneli izler
   */
  function setupPanelSearch() {
    // Tıklanan panele göre aktif paneli güncelle
    elements.clipboardPanel.addEventListener('mousedown', () => {
      lastActivePanel = 'clipboard';
    });
    elements.notesPanel.addEventListener('mousedown', () => {
      lastActivePanel = 'notes';
    });
  }

  /**
   * Başlık çubuğu butonlarının mantığı
   */
  function setupTitleBarActions() {
    // Ayarlar butonu
    elements.settingsBtn.addEventListener('click', () => {
      if (window.SettingsPanel) {
        window.SettingsPanel.openSettingsModal();
      }
    });

    // Tema Hızlı Değiştirme Butonu (🌙 / ☀️)
    elements.themeToggle.addEventListener('click', async () => {
      if (!window.api) return;
      
      const response = await window.api.getSettings();
      if (response && response.success) {
        const currentTheme = response.data.theme || 'dark';
        
        let newTheme = 'dark';
        if (currentTheme === 'dark') {
          newTheme = 'light';
        } else if (currentTheme === 'light') {
          newTheme = 'dark';
        }

        // Ayarlara kaydet (otomatik olarak UI güncellenecek)
        await window.api.saveSetting('theme', newTheme);
        elements.themeToggle.innerHTML = newTheme === 'dark' ? Utils.Icons.moon : Utils.Icons.sun;
        
        if (window.SettingsPanel) {
          window.SettingsPanel.applyTheme(newTheme);
        }
      }
    });

    // İlk ikon simgesini ayarla
    window.api.getSettings().then((res) => {
      if (res && res.success) {
        const theme = res.data.theme || 'dark';
        elements.themeToggle.innerHTML = theme === 'dark' ? Utils.Icons.moon : Utils.Icons.sun;
      }
    });

    // Main process'ten gelen tray vb. navigasyon isteklerini yakala
    if (window.api.onNavigate) {
      window.api.onNavigate((page) => {
        if (page === 'settings' && window.SettingsPanel) {
          window.SettingsPanel.openSettingsModal();
        }
      });
    }
  }

  /**
   * Klavye kısayolları dinleyicileri (örn. Ctrl+F)
   */
  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ctrl + F veya Cmd + F -> Aktif panel arama çubuğuna odaklan
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const searchInput = lastActivePanel === 'clipboard'
          ? document.getElementById('clipboard-search')
          : document.getElementById('notes-search');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
      
      // ESC tuşu -> Açık modalleri kapat
      if (e.key === 'Escape') {
        if (window.SettingsPanel) window.SettingsPanel.closeSettingsModal();
        if (window.NotesPanel) {
          // Note editor, category veya detail modalını kapat
          const editorModal = document.getElementById('note-editor-modal');
          const catModal = document.getElementById('category-manager-modal');
          const detailModal = document.getElementById('note-detail-modal');
          if (editorModal.classList.contains('active')) {
            const isNewNote = !document.getElementById('note-edit-id').value;
            if (!isNewNote) {
              editorModal.classList.remove('active');
            }
          }
          if (catModal.classList.contains('active')) {
            catModal.classList.remove('active');
          }
          if (detailModal.classList.contains('active')) {
            detailModal.classList.remove('active');
          }
        }
        if (window.ClipboardPanel) {
          // Pano detay veya editör modalını kapat
          const clipDetailModal = document.getElementById('clip-detail-modal');
          const clipEditorModal = document.getElementById('clip-editor-modal');
          if (clipDetailModal && clipDetailModal.classList.contains('active')) {
            clipDetailModal.classList.remove('active');
          }
          if (clipEditorModal && clipEditorModal.classList.contains('active')) {
            clipEditorModal.classList.remove('active');
          }
        }
        
        // Confirm dialog kapat
        if (elements.confirmDialog.classList.contains('active')) {
          handleConfirmResponse(false);
        }
      }
    });
  }

  /**
   * Alt durum çubuğunu (status bar) veritabanı istatistikleriyle günceller
   */
  async function updateStatusBar() {
    try {
      const response = await window.api.getStats();
      if (response && response.success) {
        const stats = response.data;
        elements.statusClips.textContent = Utils.formatNumber(stats.clipboard.total);
        elements.statusNotes.textContent = Utils.formatNumber(stats.notes.total);
        elements.statusPinned.textContent = Utils.formatNumber(stats.clipboard.pinned);
      }
    } catch (err) {
      console.error('İstatistikler yüklenemedi:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Küresel Promise-Tabanlı Onay Modalı (Confirm Dialog)
  // ═══════════════════════════════════════════════════════════════

  function setupConfirmDialog() {
    elements.confirmOkBtn.addEventListener('click', () => handleConfirmResponse(true));
    elements.confirmCancelBtn.addEventListener('click', () => handleConfirmResponse(false));
    
    // Arka plana tıklayınca kapat
    elements.confirmDialog.addEventListener('click', (e) => {
      if (e.target === elements.confirmDialog) handleConfirmResponse(false);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Küresel Tooltip Yönetimi
  // ═══════════════════════════════════════════════════════════════

  function setupGlobalTooltips() {
    // Tooltip elemanını oluştur
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'global-tooltip hidden';
    document.body.appendChild(tooltipEl);

    let activeTarget = null;

    // Mouseover ile tooltip göster
    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target) return;

      const text = target.getAttribute('data-tooltip');
      if (!text) return;

      activeTarget = target;
      tooltipEl.textContent = text;
      tooltipEl.classList.remove('hidden');

      // Konumu hesapla
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top;

      tooltipEl.style.left = `${x}px`;
      tooltipEl.style.top = `${y}px`;

      // Reflow ve göster
      void tooltipEl.offsetWidth;
      tooltipEl.classList.add('visible');
    });

    // Mouseout ve click durumunda tooltip gizle
    const hideTooltip = () => {
      if (!activeTarget) return;
      activeTarget = null;
      tooltipEl.classList.remove('visible');
    };

    document.addEventListener('mouseout', (e) => {
      if (activeTarget && !activeTarget.contains(e.relatedTarget)) {
        hideTooltip();
      }
    });

    document.addEventListener('click', hideTooltip);
    document.addEventListener('mousedown', hideTooltip);

    // Animasyon bitince hidden sınıfını ekle
    tooltipEl.addEventListener('transitionend', () => {
      if (!tooltipEl.classList.contains('visible')) {
        tooltipEl.classList.add('hidden');
      }
    });
  }

  /**
   * Promise tabanlı onay kutusu gösterir
   * @param {string} title - Başlık
   * @param {string} message - Ana mesaj
   * @param {string} icon - Emoji ikon
   * @returns {Promise<boolean>} Kullanıcı onayı
   */
  function confirm(title, message, icon = null) {
    return new Promise((resolve) => {
      // Eğer zaten açık bir onay varsa eskisini iptal et
      if (confirmResolve) {
        confirmResolve(false);
      }
      
      confirmResolve = resolve;
      
      elements.confirmMessage.textContent = title;
      elements.confirmSub.textContent = message;
      elements.confirmIcon.innerHTML = icon || Utils.Icons.alertTriangle;
      
      elements.confirmDialog.classList.add('active');
      Utils.initFocusTrap(elements.confirmDialog);
    });
  }

  function prompt(title, message, options = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay active runtime-prompt-modal';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      const dialog = document.createElement('div');
      dialog.className = 'modal runtime-prompt-dialog';
      const heading = document.createElement('h3');
      heading.textContent = title;
      const description = document.createElement('p');
      description.textContent = message;
      const input = document.createElement('input');
      input.className = 'form-input';
      input.type = options.type || 'text';
      input.autocomplete = 'off';
      input.maxLength = options.maxLength || 1024;
      input.setAttribute('aria-label', title);
      const error = document.createElement('small');
      error.className = 'runtime-prompt-error';
      const actions = document.createElement('div');
      actions.className = 'modal-actions';
      const cancelButton = document.createElement('button');
      cancelButton.className = 'btn btn-default';
      cancelButton.textContent = window.i18n ? window.i18n.t('btn.cancel') : 'İptal';
      const submitButton = document.createElement('button');
      submitButton.className = 'btn btn-primary';
      submitButton.textContent = window.i18n ? window.i18n.t('btn.continue') : 'Devam';

      actions.append(cancelButton, submitButton);
      dialog.append(heading, description, input, error, actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      if (window.api && window.api.setModalOpen) window.api.setModalOpen(true);

      const finish = (value) => {
        Utils.destroyFocusTrap(overlay);
        overlay.remove();
        if (window.api && window.api.setModalOpen) window.api.setModalOpen(false);
        resolve(value);
      };
      const submit = () => {
        const value = input.value;
        if (value.length < (options.minLength || 0)) {
          error.textContent = `${options.minLength} karakterden kısa olamaz.`;
          input.focus();
          return;
        }
        finish(value);
      };

      cancelButton.addEventListener('click', () => finish(null));
      submitButton.addEventListener('click', submit);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submit();
        if (event.key === 'Escape') finish(null);
      });
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) finish(null);
      });

      Utils.initFocusTrap(overlay);
      setTimeout(() => input.focus(), 0);
    });
  }

  function handleConfirmResponse(value) {
    elements.confirmDialog.classList.remove('active');
    Utils.destroyFocusTrap(elements.confirmDialog);
    if (confirmResolve) {
      confirmResolve(value);
      confirmResolve = null;
    }
  }

  /**
   * Sayfadaki tüm modalları dinler ve aktif bir modal varsa main process'e bildirir.
   */
  function setupModalObserver() {
    if (!window.api || !window.api.setModalOpen) return;

    const modalSelectors = [
      '#settings-modal',
      '#confirm-dialog',
      '#note-editor-modal',
      '#category-manager-modal',
      '#note-detail-modal',
      '#clip-detail-modal',
      '#clip-editor-modal'
    ];

    const checkModals = () => {
      let anyOpen = false;
      modalSelectors.forEach(selector => {
        const el = document.querySelector(selector);
        if (el && el.classList.contains('active')) {
          anyOpen = true;
        }
      });
      window.api.setModalOpen(anyOpen);
    };

    // İlk kontrol
    checkModals();

    // Sınıf değişikliklerini gözlemle
    const observer = new MutationObserver(() => {
      checkModals();
    });

    modalSelectors.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) {
        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
      }
    });
  }

  return {
    init,
    updateStatusBar,
    confirm,
    prompt,
  };
})();

// DOM hazır olduğunda uygulamayı çalıştır
document.addEventListener('DOMContentLoaded', () => {
  window.App = App;
  App.init();
});
