/* ═══════════════════════════════════════════════════════════════
   ClipBoard Pro — Initializer (Zero-Flicker & Zero-Layout-Shift)
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

        // 2. Sol Panel Genişliği Ayarı (Layout Shift Engelleme)
        const width = settings.leftPanelWidth;
        if (width) {
          const style = document.createElement('style');
          style.id = 'initial-panel-width-style';
          style.innerHTML = `#clipboard-panel { width: ${width}px !important; }`;
          document.head.appendChild(style);
        }
      }
    }
  } catch (e) {
    console.error('Init script hatası:', e);
  }
})();
