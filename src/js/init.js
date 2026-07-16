/* ═══════════════════════════════════════════════════════════════
   ClipBoardPrime — Initializer (Zero-Flicker & Zero-Layout-Shift)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(function() {
  try {
    if (window.api && typeof window.api.getCachedSettings === 'function') {
      const settings = window.api.getCachedSettings();
      if (settings) {
        // 1. Tema Ayarı (Flicker Engelleme)
        const theme = settings.theme || 'dark';
        let activeTheme = theme;
        if (theme === 'system') {
          const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          activeTheme = isDark ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-theme', activeTheme);

      }
    }
  } catch (e) {
    console.error('Init script hatası:', e);
  }
})();
