/* ═══════════════════════════════════════════════════════════════
   ClipBoard Pro — Settings Module
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const SettingsPanel = (() => {
  const elements = {
    modal: document.getElementById('settings-modal'),
    closeBtn: document.getElementById('settings-close-btn'),
    tabs: document.querySelectorAll('.settings-tab'),
    sections: document.querySelectorAll('.settings-section'),
    
    // Form Inputs
    theme: document.getElementById('setting-theme'),
    autostart: document.getElementById('setting-autostart'),
    sensitive: document.getElementById('setting-sensitive'),
    historyLimit: document.getElementById('setting-history-limit'),
    pollInterval: document.getElementById('setting-poll-interval'),
    
    // Data Actions
    locationPath: document.getElementById('data-location-path'),
    changeLocationBtn: document.getElementById('change-data-location-btn'),
    exportBtn: document.getElementById('export-data-btn'),
    importBtn: document.getElementById('import-data-btn'),
    clearAllBtn: document.getElementById('danger-clear-btn'),
  };

  let currentSettings = {};

  /**
   * Modülü başlatır ve olay dinleyicilerini kurar
   */
  function init() {
    setupEventListeners();
    loadSettings();
  }

  /**
   * Olay dinleyicilerini tanımlar
   */
  function setupEventListeners() {
    // Kapatma butonu
    elements.closeBtn.addEventListener('click', () => closeSettingsModal());

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

    // ─── Veri Ayarları Dinleyicileri ───
    elements.changeLocationBtn.addEventListener('click', () => changeDataLocation());
    elements.exportBtn.addEventListener('click', () => exportData());
    elements.importBtn.addEventListener('click', () => importData());
    elements.clearAllBtn.addEventListener('click', () => clearAllHistory());

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
  }

  /**
   * Ayarları yükler ve UI'ı doldurur
   */
  async function loadSettings() {
    try {
      const response = await window.api.getSettings();
      if (response && response.success) {
        currentSettings = response.data;
        
        // UI alanlarını doldur
        elements.theme.value = currentSettings.theme || 'dark';
        elements.autostart.checked = currentSettings.startWithWindows === 'true';
        elements.sensitive.checked = currentSettings.detectSensitive === 'true';
        elements.historyLimit.value = currentSettings.maxHistory || '0';
        elements.pollInterval.value = currentSettings.pollingInterval || '500';

        // Temayı uygula
        applyTheme(currentSettings.theme);

        // Veritabanı konumunu ve istatistikleri al
        await refreshLocationPath();
      }
    } catch (err) {
      console.error('loadSettings hatası:', err);
    }
  }

  /**
   * Tek bir ayarı veritabanına kaydeder
   */
  async function saveSetting(key, value) {
    try {
      const response = await window.api.saveSetting(key, value);
      if (response && response.success) {
        currentSettings[key] = value;
        Utils.showToast('Ayar kaydedildi', 'success');

        // Tema ayarı değiştiyse anında uygula
        if (key === 'theme') {
          applyTheme(value);
        }
      } else {
        Utils.showToast('Ayar kaydedilemedi: ' + response?.error, 'error');
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
      elements.locationPath.textContent = 'Konum okunamadı';
    }
  }

  /**
   * Veritabanı konumunu değiştirmeyi tetikler
   */
  async function changeDataLocation() {
    const confirmed = await window.App.confirm(
      'Veri Konumunu Taşı',
      'Veritabanı konumunu değiştirmek ve mevcut verilerinizi yeni konuma kopyalamak istediğinize emin misiniz?',
      Utils.Icons.settings
    );

    if (!confirmed) return;

    try {
      const response = await window.api.selectDataLocation();
      if (response && response.success) {
        Utils.showToast('Veritabanı konumu başarıyla taşındı.', 'success');
        await refreshLocationPath();
        
        // Yeni veri kaynağından her şeyi tekrar yükle
        if (window.ClipboardPanel) window.ClipboardPanel.loadHistory(false);
        if (window.NotesPanel) {
          window.NotesPanel.loadCategories();
          window.NotesPanel.loadNotes();
        }
      } else if (response && response.error !== 'İptal edildi') {
        Utils.showToast('Taşıma başarısız: ' + response.error, 'error');
      }
    } catch (err) {
      console.error(err);
      Utils.showToast('İşlem sırasında bir hata oluştı', 'error');
    }
  }

  /**
   * Verileri JSON olarak dışa aktarır
   */
  async function exportData() {
    try {
      const response = await window.api.exportData();
      if (response && response.success) {
        Utils.showToast('Veriler başarıyla yedeklendi.', 'success');
      } else if (response && response.error !== 'İptal edildi') {
        Utils.showToast('Dışa aktarma hatası: ' + response.error, 'error');
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
      'Veriyi İçe Aktar',
      'Seçilen yedek dosyasındaki veriler mevcut veritabanınıza eklenecektir. Devam etmek istiyor musiniz?',
      Utils.Icons.download
    );

    if (!confirmed) return;

    try {
      const response = await window.api.importData();
      if (response && response.success) {
        const res = response.data;
        Utils.showToast(`İçe aktarma başarılı! (${res.clipboard_history} pano, ${res.notes} not eklendi)`, 'success');
        
        // Uygulamadaki tüm listeleri yenile
        if (window.ClipboardPanel) window.ClipboardPanel.loadHistory(false);
        if (window.NotesPanel) {
          await window.NotesPanel.loadCategories();
          window.NotesPanel.loadNotes();
        }
      } else if (response && response.error !== 'İptal edildi') {
        Utils.showToast('İçe aktarma hatası: ' + response.error, 'error');
      }
    } catch (err) {
      console.error(err);
      Utils.showToast('Dosya okuma veya yazma hatası oluştu', 'error');
    }
  }

  /**
   * Sabitlenmişler dahil tüm pano geçmişini siler
   */
  async function clearAllHistory() {
    const confirmed1 = await window.App.confirm(
      'Kritik Eylem: Tüm Geçmişi Sil',
      'Sabitlenmiş ve favorilenmiş öğeler dahil TÜM pano geçmişini silmek istediğinize emin misiniz? Bu işlem geri alınamaz!',
      Utils.Icons.alertTriangle
    );

    if (!confirmed1) return;

    const confirmed2 = await window.App.confirm(
      'Son Onay',
      'Gerçekten emin misiniz? Tüm pano verileriniz kalıcı olarak yok edilecektir.',
      Utils.Icons.alertCircle
    );

    if (!confirmed2) return;

    try {
      // 1. Önce sabitlenmiş tüm öğeleri bulup tek tek silelim (çünkü clearHistory sadece pinned=0 siler)
      const pinResponse = await window.api.getClipboardHistory({ pinned: true, limit: 10000 });
      if (pinResponse && pinResponse.success) {
        const pinnedItems = pinResponse.data.items;
        for (const item of pinnedItems) {
          await window.api.deleteClipboardItem(item.id);
        }
      }

      // 2. Kalan tüm geçmişi (normal öğeleri) de temizleyelim
      const response = await window.api.clearClipboardHistory();
      if (response && response.success) {
        Utils.showToast('Tüm pano geçmişi kalıcı olarak temizlendi.', 'success');
        
        // Listeyi yenile
        if (window.ClipboardPanel) window.ClipboardPanel.loadHistory(false);
      }
    } catch (err) {
      console.error(err);
      Utils.showToast('Temizleme hatası oluştu', 'error');
    }
  }

  function openSettingsModal() {
    elements.modal.classList.add('active');
    
    // İlk sekme varsayılan aktif
    elements.tabs[0].click();
  }

  function closeSettingsModal() {
    elements.modal.classList.remove('active');
  }

  return {
    init,
    openSettingsModal,
    closeSettingsModal,
    applyTheme,
  };
})();

window.SettingsPanel = SettingsPanel;

