/* ═══════════════════════════════════════════════════════════════
   ClipBoardPrime — Utility Functions
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const Utils = (() => {

  const Icons = {
    clipboard: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    search: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    sun: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
    moon: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`,
    monitor: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
    settings: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    trash: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
    tag: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`,
    plus: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    fileText: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
    box: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`,
    alignLeft: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>`,
    image: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
    link: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
    code: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
    pin: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="8" x2="22" y2="8"></line><line x1="12" y1="2" x2="12" y2="6"></line><path d="M12 6H8a2 2 0 0 0-2 2v2a6 6 0 0 0 6 6h2a6 6 0 0 0 6-6V8a2 2 0 0 0-2-2h-4"></path><line x1="12" y1="16" x2="12" y2="22"></line></svg>`,
    star: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    eye: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    eyeOff: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
    lock: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    copy: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    paste: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M12 11v6"></path><path d="M9 14h6"></path></svg>`,
    upload: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`,
    download: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    alertTriangle: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    checkCircle: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    alertCircle: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
    info: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    close: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    save: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`,
    folder: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
    briefcase: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`,
    user: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
    chart: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
    email: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`,
    edit: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path></svg>`,
    maximize: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>`,
    restore: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg>`
  };

  /**
   * Tarihi locale'e göre formatlar: "Today 03:45 PM", "Yesterday", "12 Jun 2026"
   */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const locale = (window.i18n && window.i18n.t('date.timeLocale')) || 'tr-TR';
    const opts = (window.i18n && window.i18n.tObj('date.timeOptions')) || { hour: '2-digit', minute: '2-digit' };
    const timeStr = date.toLocaleTimeString(locale, opts);

    if (dateDay.getTime() === today.getTime()) {
      return `${window.i18n ? window.i18n.t('date.today') : 'Bugün'} ${timeStr}`;
    }
    if (dateDay.getTime() === yesterday.getTime()) {
      return `${window.i18n ? window.i18n.t('date.yesterday') : 'Dün'} ${timeStr}`;
    }

    const months = (window.i18n && window.i18n.tArray('date.months').length > 0)
      ? window.i18n.tArray('date.months')
      : ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  /**
   * Locale'e göre zaman farkı: "Just now", "5m ago", "2h ago"
   */
  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    const _ = (key, vars) => window.i18n ? window.i18n.t(key, vars) : key;

    if (diffSec < 10) return _('date.justNow');
    if (diffSec < 60) return _('date.secondsAgo', { n: diffSec });
    if (diffMin < 60) return _('date.minutesAgo', { n: diffMin });
    if (diffHour < 24) return _('date.hoursAgo', { n: diffHour });
    if (diffDay < 7) return _('date.daysAgo', { n: diffDay });
    if (diffDay < 30) return _('date.weeksAgo', { n: Math.floor(diffDay / 7) });
    if (diffDay < 365) return _('date.monthsAgo', { n: Math.floor(diffDay / 30) });
    return _('date.yearsAgo', { n: Math.floor(diffDay / 365) });
  }

  /**
   * Bir tarihin hangi gruba ait olduğunu locale'e göre döndürür
   */
  function getDateGroup(dateStr) {
    const _ = (key) => window.i18n ? window.i18n.t(key) : key;
    if (!dateStr) return _('date.other');
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (dateDay.getTime() >= today.getTime()) return _('date.today');
    if (dateDay.getTime() >= yesterday.getTime()) return _('date.yesterday');
    if (dateDay.getTime() >= weekAgo.getTime()) return _('date.thisWeek');
    return _('date.older');
  }

  /**
   * Metni belirli uzunlukta kısaltır
   */
  function truncate(str, length = 100) {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length).trimEnd() + '…';
  }

  /**
   * HTML karakterlerini escape eder (template literal güvenliği için backtick dahil)
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/`/g, '&#96;');
  }

  /**
   * İçerik tipi için emoji ikon
   */
  function getContentTypeIcon(type) {
    const icons = {
      text: Icons.fileText,
      url: Icons.link,
      email: Icons.email,
      code: Icons.code,
      image: Icons.image,
    };
    return icons[type] || Icons.fileText;
  }

  /**
   * İçerik tipi için lokalize etiket
   */
  function getContentTypeLabel(type) {
    if (window.i18n) {
      return window.i18n.t(`type.${type}`) || window.i18n.t('type.text');
    }
    const labels = { text: 'Metin', url: 'URL', email: 'E-posta', code: 'Kod', image: 'Görsel' };
    return labels[type] || 'Metin';
  }

  /**
   * Debounce fonksiyonu
   */
  function debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Toast notification gösterir
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: Icons.checkCircle,
      error: Icons.alertCircle,
      info: Icons.info,
      warning: Icons.alertTriangle,
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const closeLabel = window.i18n ? window.i18n.t('tooltip.closeToast') : 'Kapat';
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.innerHTML = icons[type] || icons.info;
    const messageElement = document.createElement('span');
    messageElement.className = 'toast-message';
    messageElement.textContent = String(message);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.type = 'button';
    closeBtn.dataset.tooltip = closeLabel;
    closeBtn.setAttribute('aria-label', closeLabel);
    closeBtn.textContent = '✕';
    toast.append(icon, messageElement, closeBtn);
    closeBtn.addEventListener('click', () => removeToast(toast));

    container.appendChild(toast);

    // Otomatik kaldır
    setTimeout(() => removeToast(toast), 2500);
  }

  function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('removing');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }

  /**
   * Kopyalama flash animasyonu
   */
  function copyFlashAnimation(element) {
    if (!element) return;
    element.classList.remove('copy-flash');
    // Force reflow
    void element.offsetWidth;
    element.classList.add('copy-flash');
    element.addEventListener('animationend', () => {
      element.classList.remove('copy-flash');
    }, { once: true });
  }

  /**
   * Arama sorgusuna göre metni vurgular (highlight)
   */
  function highlightText(text, query) {
    if (!query || !text) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escaped.replace(regex, '<span class="highlight">$1</span>');
  }

  /**
   * Sayıyı locale'e göre binlik ayıraçlı formata çevirir
   */
  function formatNumber(num) {
    if (num == null) return '0';
    const locale = (window.i18n && window.i18n.t('date.timeLocale')) || 'tr-TR';
    return Number(num).toLocaleString(locale);
  }

  let lastActiveElement = null;

  function initFocusTrap(modal) {
    lastActiveElement = document.activeElement;
    
    const allFocusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const focusableElements = Array.from(allFocusable).filter(el => {
      if (el.disabled) return false;
      
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });

    if (focusableElements.length === 0) return;
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    // İlk elemana odaklan
    setTimeout(() => firstElement.focus(), 100);

    const trapHandler = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) { // Shift + Tab
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else { // Tab
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    modal._trapHandler = trapHandler;
    modal.addEventListener('keydown', trapHandler);
  }

  function destroyFocusTrap(modal) {
    if (modal._trapHandler) {
      modal.removeEventListener('keydown', modal._trapHandler);
      delete modal._trapHandler;
    }
    if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
      setTimeout(() => lastActiveElement.focus(), 50);
    }
  }

  /**
   * Hover ile kart seçimi: arama/modal gibi düzenleme bağlamlarında odağı çalmaz.
   * Space ve ok tuşlarının fareyle üzerinde durulan kartta çalışmasını sağlar.
   */
  function canHoverSelectCard() {
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return true;
    if (active.matches('input, textarea, select') || active.isContentEditable) return false;
    if (active.closest('.modal-overlay.active, .clipboard-quick-preview.visible')) return false;
    return true;
  }

  function hoverSelectCard(el) {
    if (!el || !canHoverSelectCard()) return;
    if (document.activeElement === el) return;
    el.focus({ preventScroll: true });
  }

  /**
   * Horizontal filter/category chip drag-and-drop reorder.
   * @param {HTMLElement} container
   * @param {object} options
   * @param {(buttons: HTMLElement[]) => void|Promise<void>} options.onReorder
   * @param {(btn: HTMLElement) => boolean} [options.isDraggable] — default: all .filter-btn
   * @param {string} [options.buttonSelector]
   */
  function enableFilterTabDrag(container, options = {}) {
    if (!container || container.dataset.dragReady === '1') return;
    container.dataset.dragReady = '1';

    const buttonSelector = options.buttonSelector || '.filter-btn';
    const isDraggable = typeof options.isDraggable === 'function'
      ? options.isDraggable
      : () => true;

    let dragEl = null;
    let suppressClick = false;

    const getButtons = () => Array.from(container.querySelectorAll(buttonSelector));

    const refreshDraggable = () => {
      getButtons().forEach((btn) => {
        const allow = isDraggable(btn);
        btn.draggable = allow;
        btn.classList.toggle('filter-btn-draggable', allow);
        if (allow) {
          btn.title = window.i18n ? window.i18n.t('tooltip.dragToReorder') : 'Sürükleyerek sırala';
        }
      });
    };

    container.addEventListener('click', (e) => {
      if (!suppressClick) return;
      // Swallow the click that browsers fire after a successful drag-drop.
      e.stopPropagation();
      e.preventDefault();
      suppressClick = false;
    }, true);

    container.addEventListener('dragstart', (e) => {
      const btn = e.target.closest(buttonSelector);
      if (!btn || !container.contains(btn) || !isDraggable(btn)) {
        e.preventDefault();
        return;
      }
      dragEl = btn;
      suppressClick = false;
      btn.classList.add('filter-btn-dragging');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', btn.dataset.filter || btn.dataset.category || 'tab');
      } catch (_) { /* ignore */ }
    });

    container.addEventListener('dragend', () => {
      if (dragEl) dragEl.classList.remove('filter-btn-dragging');
      getButtons().forEach((b) => b.classList.remove('filter-btn-drag-over'));
      dragEl = null;
      // Keep suppressClick true briefly if drop set it.
      setTimeout(() => { suppressClick = false; }, 50);
    });

    container.addEventListener('dragover', (e) => {
      if (!dragEl) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) { /* ignore */ }
      const over = e.target.closest(buttonSelector);
      getButtons().forEach((b) => b.classList.toggle('filter-btn-drag-over', b === over && b !== dragEl && isDraggable(b)));
    });

    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!dragEl) return;
      const over = e.target.closest(buttonSelector);
      getButtons().forEach((b) => b.classList.remove('filter-btn-drag-over'));
      if (!over || over === dragEl || !container.contains(over) || !isDraggable(over)) {
        dragEl.classList.remove('filter-btn-dragging');
        dragEl = null;
        return;
      }

      const rect = over.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      if (before) container.insertBefore(dragEl, over);
      else container.insertBefore(dragEl, over.nextSibling);

      dragEl.classList.remove('filter-btn-dragging');
      dragEl = null;
      suppressClick = true;

      if (typeof options.onReorder === 'function') {
        await options.onReorder(getButtons());
      }
    });

    // MutationObserver so newly rendered category chips become draggable
    const mo = new MutationObserver(() => refreshDraggable());
    mo.observe(container, { childList: true, subtree: false });
    refreshDraggable();

    return { refreshDraggable };
  }

  return {
    Icons,
    formatDate,
    timeAgo,
    getDateGroup,
    truncate,
    escapeHtml,
    getContentTypeIcon,
    getContentTypeLabel,
    debounce,
    showToast,
    copyFlashAnimation,
    highlightText,
    formatNumber,
    initFocusTrap,
    destroyFocusTrap,
    canHoverSelectCard,
    hoverSelectCard,
    enableFilterTabDrag,
  };

})();

window.Utils = Utils;
