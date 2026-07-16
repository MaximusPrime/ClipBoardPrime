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

        // 2. Sol Panel Genişliği Ayarı (Layout Shift Engelleme)
        let panelWidth = settings.leftPanelWidth;
        const ratio = settings.leftPanelWidthRatio;
        if (ratio) {
          const parsedRatio = parseFloat(ratio);
          if (parsedRatio > 0.1 && parsedRatio < 0.9) {
            panelWidth = Math.round(window.innerWidth * parsedRatio);
          }
        }

        if (panelWidth) {
          const style = document.createElement('style');
          style.id = 'initial-panel-width-style';
          style.innerHTML = `#clipboard-panel { width: ${panelWidth}px !important; }`;
          document.head.appendChild(style);
        }
      }
    }
  } catch (e) {
    console.error('Init script hatası:', e);
  }
})();
