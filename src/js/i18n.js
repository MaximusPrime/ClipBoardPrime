/* ═══════════════════════════════════════════════════════════════
   ClipBoard Prime — i18n Internationalization Engine
   Supports: tr (Turkish), en (English), zh (Chinese Simplified), pt-BR (Portuguese - Brazil)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const i18n = (() => {
  const SUPPORTED = ['tr', 'en', 'zh', 'pt-BR'];
  const DEFAULT_LANG = 'en';
  const LOCALE_DIR = './locales/';

  let currentLang = DEFAULT_LANG;
  const translations = {};

  /**
   * Loads a locale JSON file and caches it.
   */
  async function loadLocale(lang) {
    if (translations[lang]) return; // Already loaded
    try {
      const response = await fetch(`${LOCALE_DIR}${lang}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      translations[lang] = await response.json();
    } catch (err) {
      console.error(`[i18n] Failed to load locale "${lang}":`, err);
      translations[lang] = {}; // Empty fallback
    }
  }

  /**
   * Resolves a dot-notation key from a locale object.
   * e.g. "date.today" -> locale.date.today
   */
  function resolve(obj, key) {
    if (!obj || !key) return undefined;
    return key.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
  }

  /**
   * Returns the translated string for a key with optional variable interpolation.
   * Variables are replaced using {{varName}} syntax.
   *
   * @param {string} key  - Dot-notation key (e.g. "toast.copied")
   * @param {object} vars - Optional variables (e.g. { count: 5 })
   * @returns {string}
   */
  function t(key, vars = {}) {
    let value =
      resolve(translations[currentLang], key) ||
      resolve(translations['tr'], key) ||   // Fallback to Turkish
      resolve(translations['en'], key) ||   // Fallback to English
      resolve(translations['zh'], key) ||    // Fallback to Chinese (Simplified)
      resolve(translations['pt-BR'], key) || // Fallback to Portuguese (Brazil)
      key;                                  // Last resort: key itself

    if (typeof value !== 'string') {
      return key;
    }

    // Interpolation: replace {{varName}} with vars[varName]
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) => {
      return vars[k] !== undefined ? String(vars[k]) : '';
    });
  }

  /**
   * Returns a locale array (e.g. date.months).
   * @param {string} key
   * @returns {Array}
   */
  function tArray(key) {
    const value =
      resolve(translations[currentLang], key) ||
      resolve(translations['tr'], key) ||
      resolve(translations['en'], key) ||
      resolve(translations['zh'], key) ||
      resolve(translations['pt-BR'], key);
    return Array.isArray(value) ? value : [];
  }

  /**
   * Returns a locale object (e.g. date.timeOptions).
   * @param {string} key
   * @returns {object}
   */
  function tObj(key) {
    const value =
      resolve(translations[currentLang], key) ||
      resolve(translations['tr'], key) ||
      resolve(translations['en'], key) ||
      resolve(translations['zh'], key) ||
      resolve(translations['pt-BR'], key);
    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  }

  /**
   * Updates the DOM by reading all [data-i18n] attributes and
   * replacing textContent or specific HTML attributes accordingly.
   *
   * Supported attribute formats in data-i18n value:
   *   - "key"                      → sets textContent
   *   - "[placeholder]key"         → sets placeholder attribute
   *   - "[aria-label]key"          → sets aria-label attribute
   *   - "[data-tooltip]key"        → sets data-tooltip attribute
   *   - "[title]key"               → sets title attribute
   *   - "key [placeholder]other"   → multiple assignments on one element
   */
  function updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const raw = el.getAttribute('data-i18n');
      if (!raw) return;

      // Split on whitespace before "[" to support multiple assignments
      const parts = raw.match(/\[[^\]]+\][^\s\[]+|[^\s\[]+/g) || [];

      parts.forEach(part => {
        const attrMatch = part.match(/^\[([^\]]+)\](.+)$/);
        if (attrMatch) {
          // Attribute replacement: [attr]key
          const attr = attrMatch[1];
          const key = attrMatch[2];
          el.setAttribute(attr, t(key));
        } else {
          // Text content replacement
          el.textContent = t(part);
        }
      });
    });

    // Update HTML lang attribute
    const htmlEl = document.documentElement;
    if (currentLang === 'zh') {
      htmlEl.setAttribute('lang', 'zh-CN');
    } else if (currentLang === 'pt-BR') {
      htmlEl.setAttribute('lang', 'pt-BR');
    } else {
      htmlEl.setAttribute('lang', currentLang);
    }
  }

  /**
   * Sets the active language and updates the DOM.
   * @param {string} lang - Language code ('tr', 'en', 'zh', 'pt-BR')
   */
  async function setLanguage(lang) {
    if (!SUPPORTED.includes(lang)) {
      console.warn(`[i18n] Unsupported language "${lang}", falling back to "${DEFAULT_LANG}"`);
      lang = DEFAULT_LANG;
    }
    await loadLocale(lang);
    currentLang = lang;
    updateDOM();
  }

  /**
   * Returns the currently active language code.
   * @returns {string}
   */
  function getLanguage() {
    return currentLang;
  }

  /**
   * Initializes the i18n engine. Loads all supported locales upfront
   * (they are small JSON files) and applies the saved language.
   *
   * @param {string|null} savedLang - Language code from saved settings, or null
   */
  async function init(savedLang) {
    // Load all locales in parallel for instant switching later
    await Promise.all(SUPPORTED.map(lang => loadLocale(lang)));

    // Determine language to use:
    // 1. Saved setting (if valid)
    // 2. Always fall back to DEFAULT_LANG ('en')
    const lang = (savedLang && SUPPORTED.includes(savedLang)) ? savedLang : DEFAULT_LANG;
    currentLang = lang;

    updateDOM();
  }

  return {
    t,
    tArray,
    tObj,
    setLanguage,
    getLanguage,
    updateDOM,
    init,
    SUPPORTED,
  };
})();

window.i18n = i18n;
