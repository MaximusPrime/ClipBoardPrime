'use strict';

const Onboarding = (() => {
  let step = 0;
  let initialized = false;
  const lastStep = 2;

  const get = (id) => document.getElementById(id);
  const t = (key, fallback, params) => (
    window.i18n ? window.i18n.t(key, params) : fallback
  );

  function init() {
    if (!window.App?.settings) return;
    bindEvents();
    if (window.App.settings.onboardingCompleted !== 'true') open();
  }

  function bindEvents() {
    if (initialized) return;
    const modal = get('onboarding-modal');
    if (!modal) return;
    get('onboarding-next-btn').addEventListener('click', handleNext);
    get('onboarding-back-btn').addEventListener('click', () => showStep(step - 1));
    get('onboarding-import-btn').addEventListener('click', importBackup);
    get('onboarding-language')?.addEventListener('change', changeLanguage);
    get('onboarding-theme')?.addEventListener('change', previewTheme);
    initialized = true;
  }

  async function open() {
    bindEvents();
    const modal = get('onboarding-modal');
    if (!modal) return;
    get('onboarding-theme').value = window.App.settings.theme || 'dark';
    get('onboarding-language').value = window.App.settings.language || window.i18n?.getLanguage() || 'en';
    get('onboarding-workspace').value = window.App.settings.workspaceMode === 'notes' ? 'notes' : 'clipboard';
    get('onboarding-cursor').checked = window.App.settings.windowOpenPosition === 'cursor';
    get('onboarding-autostart').checked = window.App.settings.startWithWindows !== 'false';
    get('onboarding-import-password').value = '';
    get('onboarding-import-result').textContent = '';
    get('onboarding-next-btn').disabled = false;

    modal.classList.add('active');
    Utils.initFocusTrap(modal);
    showStep(0);
    await loadDetectedBackups();
  }

  function showStep(nextStep) {
    step = Math.max(0, Math.min(lastStep, nextStep));
    document.querySelectorAll('[data-onboarding-step]').forEach((element) => {
      element.classList.toggle('active', Number(element.dataset.onboardingStep) === step);
    });
    document.querySelectorAll('[data-onboarding-dot]').forEach((element) => {
      element.classList.toggle('active', Number(element.dataset.onboardingDot) <= step);
    });

    get('onboarding-back-btn').style.visibility = step === 0 ? 'hidden' : 'visible';
    get('onboarding-step-label').textContent = `${step + 1} / ${lastStep + 1}`;
    get('onboarding-next-btn').textContent = step === lastStep
      ? t('onboarding.finish', 'Başla')
      : t('btn.next', 'İleri');
    updateReadyShortcut();
  }

  function updateReadyShortcut() {
    const ready = get('onboarding-ready');
    if (!ready) return;
    const shortcut = window.App?.settings?.globalShortcut || 'Ctrl+Shift+V';
    ready.textContent = t(
      'onboarding.readyDesc',
      `Hazırsınız. Global kısayolunuz: ${shortcut}`,
      { shortcut }
    );
  }

  async function handleNext() {
    if (step < lastStep) {
      showStep(step + 1);
      return;
    }
    await finish();
  }

  async function finish() {
    const selectedTheme = get('onboarding-theme').value;
    const selectedLanguage = get('onboarding-language').value;
    const selectedWorkspace = get('onboarding-workspace').value;
    const settings = [
      ['theme', selectedTheme],
      ['language', selectedLanguage],
      ['workspaceMode', selectedWorkspace],
      ['workspaceOpenMode', selectedWorkspace],
      ['windowOpenPosition', get('onboarding-cursor').checked ? 'cursor' : 'remember'],
      ['startWithWindows', String(get('onboarding-autostart').checked)],
      ['onboardingCompleted', 'true'],
    ];

    get('onboarding-next-btn').disabled = true;
    try {
      for (const [key, value] of settings) {
        const response = await window.api.saveSetting(key, value);
        if (!response?.success) throw new Error(response?.error || key);
        window.App.settings[key] = value;
      }
      window.SettingsPanel?.applyTheme(selectedTheme);
      await window.App.setWorkspaceMode(selectedWorkspace, true);
      close();
      Utils.showToast(t('onboarding.completed', 'ClipBoardPrime kullanıma hazır.', null), 'success');
    } catch (error) {
      Utils.showToast(`${t('toast.settingFailed', 'Ayar kaydedilemedi')}: ${error.message}`, 'error');
      get('onboarding-next-btn').disabled = false;
    }
  }

  async function changeLanguage(event) {
    const language = event.target.value;
    if (window.i18n) await window.i18n.setLanguage(language);
    window.App.settings.language = language;
    showStep(step);
  }

  function previewTheme(event) {
    window.SettingsPanel?.applyTheme(event.target.value);
  }

  async function importBackup() {
    const button = get('onboarding-import-btn');
    const result = get('onboarding-import-result');
    button.disabled = true;
    result.className = 'onboarding-import-result';
    result.textContent = t('onboarding.selectBackup', 'İçe aktarılacak yedek dosyasını seçin...');

    try {
      const response = await window.api.importData(get('onboarding-import-password').value);
      if (!response?.success) {
        if (response?.error === 'İptal edildi') {
          result.textContent = '';
          return;
        }
        throw new Error(response?.error || 'Import failed');
      }

      await handleImportedData(response.data);
    } catch (error) {
      result.classList.add('error');
      result.textContent = `${t('toast.importFailed', 'İçe aktarma hatası')}: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  async function loadDetectedBackups() {
    const container = get('onboarding-detected-backups');
    if (!container || !window.api.findLegacyBackups) return;
    container.innerHTML = '';
    const response = await window.api.findLegacyBackups();
    if (!response?.success || response.data.length === 0) return;

    const title = document.createElement('strong');
    title.textContent = t('onboarding.detectedTitle', 'Bulunan eski yedekler');
    container.appendChild(title);
    response.data.forEach((backup) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'onboarding-detected-backup';
      row.innerHTML = `
        <span><b>${Utils.escapeHtml(backup.name)}</b><small>${Utils.escapeHtml(formatBackupSize(backup.size))} · ${Utils.escapeHtml(Utils.formatDate(backup.modifiedAt))}</small></span>
        <em>${backup.encrypted ? 'CPBACKUP' : 'JSON'}</em>`;
      row.addEventListener('click', () => importDetectedBackup(backup, row));
      container.appendChild(row);
    });
  }

  function formatBackupSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  async function importDetectedBackup(backup, row) {
    const result = get('onboarding-import-result');
    const password = get('onboarding-import-password').value;
    if (backup.encrypted && !password) {
      result.className = 'onboarding-import-result error';
      result.textContent = t('onboarding.passwordRequired', 'Şifreli yedek için parola girin.');
      return;
    }
    if (!backup.encrypted) {
      const confirmed = await window.App.confirm(
        t('onboarding.unencryptedTitle', 'Şifresiz JSON yedeği'),
        t('onboarding.unencryptedDesc', 'Bu eski JSON dosyası şifreli değildir; parola doğrulaması yapılamaz. İçe aktarmak istiyor musunuz?'),
        Utils.Icons.lock
      );
      if (!confirmed) return;
    }
    row.disabled = true;
    try {
      const response = await window.api.importDetectedBackup(
        backup.path,
        password
      );
      if (!response?.success) throw new Error(response?.error || 'Import failed');
      await handleImportedData(response.data);
    } catch (error) {
      result.className = 'onboarding-import-result error';
      result.textContent = `${t('toast.importFailed', 'İçe aktarma hatası')}: ${error.message}`;
    } finally {
      row.disabled = false;
    }
  }

  async function handleImportedData(imported) {
    const result = get('onboarding-import-result');
    result.className = 'onboarding-import-result success';
    result.textContent = t(
      'onboarding.importSuccess',
      `${imported.clipboard_history} pano öğesi ve ${imported.notes} not içe aktarıldı.`,
      { clipboard: imported.clipboard_history, notes: imported.notes }
    );
    window.ClipboardPanel?.loadHistory(false);
    if (window.NotesPanel) {
      await window.NotesPanel.loadCategories();
      window.NotesPanel.loadNotes();
    }
    window.App.updateStatusBar();
  }

  function close() {
    const modal = get('onboarding-modal');
    modal.classList.remove('active');
    Utils.destroyFocusTrap(modal);
  }

  return { init, open };
})();

window.Onboarding = Onboarding;
