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
    
    // Search
    globalSearch: document.getElementById('global-search'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    
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

  /**
   * Uygulamayı başlatır
   */
  async function init() {
    // 1. Önce Ayarları Yükle ve Başlat (Tema gibi ayarların ilk yüklenmesi için)
    if (window.SettingsPanel) {
      window.SettingsPanel.init();
    }

    // 2. Diğer panelleri başlat
    if (window.ClipboardPanel) window.ClipboardPanel.init();
    if (window.NotesPanel) window.NotesPanel.init();

    // 3. Genel UI olaylarını ve Panel Genişliğini Kur
    setupResizer();
    setupGlobalSearch();
    setupTitleBarActions();
    setupKeyboardShortcuts();
    setupConfirmDialog();
    setupGlobalTooltips();
    
    // Kayıtlı panel genişliğini uygula
    await loadPanelWidth();
    
    // Alt durum çubuğunu doldur
    updateStatusBar();
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

      // Genişliği ayara kaydet
      const currentWidth = parseInt(elements.clipboardPanel.style.width);
      if (currentWidth && window.api) {
        window.api.saveSetting('leftPanelWidth', String(currentWidth));
      }
    });
  }

  /**
   * Kayıtlı sol panel genişliğini ayardan yükler
   */
  async function loadPanelWidth() {
    try {
      if (window.api) {
        const response = await window.api.getSettings();
        if (response && response.success) {
          const width = response.data.leftPanelWidth;
          if (width) {
            elements.clipboardPanel.style.width = `${width}px`;
          }
        }
      }
    } catch (err) {
      console.error('Panel genişliği yüklenemedi:', err);
    }
  }

  /**
   * Küresel arama kutusu dinleyicileri
   */
  function setupGlobalSearch() {
    const performSearch = Utils.debounce((query) => {
      if (window.ClipboardPanel) window.ClipboardPanel.setSearch(query);
      if (window.NotesPanel) window.NotesPanel.setSearch(query);
    }, 250);

    elements.globalSearch.addEventListener('input', (e) => {
      const query = e.target.value;
      
      // Arama temizleme butonunun görünürlüğü
      if (query.trim().length > 0) {
        elements.searchClearBtn.classList.add('visible');
      } else {
        elements.searchClearBtn.classList.remove('visible');
      }

      performSearch(query);
    });

    // Arama temizleme butonu
    elements.searchClearBtn.addEventListener('click', () => {
      elements.globalSearch.value = '';
      elements.searchClearBtn.classList.remove('visible');
      if (window.ClipboardPanel) window.ClipboardPanel.setSearch('');
      if (window.NotesPanel) window.NotesPanel.setSearch('');
      elements.globalSearch.focus();
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
      // Ctrl + F veya Cmd + F -> Arama çubuğuna odaklan
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        elements.globalSearch.focus();
        elements.globalSearch.select();
      }
      
      // ESC tuşu -> Açık modalleri kapat
      if (e.key === 'Escape') {
        if (window.SettingsPanel) window.SettingsPanel.closeSettingsModal();
        if (window.NotesPanel) {
          // Note editor veya category modalını kapat
          const editorModal = document.getElementById('note-editor-modal');
          const catModal = document.getElementById('category-manager-modal');
          if (editorModal.classList.contains('active')) {
            editorModal.classList.remove('active');
          }
          if (catModal.classList.contains('active')) {
            catModal.classList.remove('active');
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
    });
  }

  function handleConfirmResponse(value) {
    elements.confirmDialog.classList.remove('active');
    if (confirmResolve) {
      confirmResolve(value);
      confirmResolve = null;
    }
  }

  return {
    init,
    updateStatusBar,
    confirm,
  };
})();

// DOM hazır olduğunda uygulamayı çalıştır
document.addEventListener('DOMContentLoaded', () => {
  window.App = App;
  App.init();
});
