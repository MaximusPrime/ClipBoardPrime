/* ═══════════════════════════════════════════════════════════════
   ClipBoardPrime — Clipboard Panel Module
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const ClipboardPanel = (() => {
  const elements = {
    list: document.getElementById('clipboard-list'),
    count: document.getElementById('clipboard-count'),
    filters: document.getElementById('clipboard-filters'),
    clearBtn: document.getElementById('clear-history-btn'),
    selectBtn: document.getElementById('clipboard-select-btn'),
    selectionBar: document.getElementById('clipboard-selection-bar'),
    selectAllCheckbox: document.getElementById('clipboard-select-all-checkbox'),
    selectedCount: document.getElementById('clipboard-selected-count'),
    deleteSelectedBtn: document.getElementById('clipboard-delete-selected-btn'),
    cancelSelectionBtn: document.getElementById('clipboard-cancel-selection-btn'),
    search: document.getElementById('clipboard-search'),
    searchClear: document.getElementById('clipboard-search-clear'),
    advancedFilterBtn: document.getElementById('clipboard-advanced-filter-btn'),
    advancedFilters: document.getElementById('clipboard-advanced-filters'),
    advancedFilterCount: document.getElementById('clipboard-advanced-filter-count'),
    filterPeriod: document.getElementById('clipboard-filter-period'),
    filterSource: document.getElementById('clipboard-filter-source'),
    filterLength: document.getElementById('clipboard-filter-length'),
    filterSensitive: document.getElementById('clipboard-filter-sensitive'),
    filterReset: document.getElementById('clipboard-filter-reset'),
  };

  let historyItems = [];
  let isSelectionMode = false;
  let selectedItemIds = new Set();
  let lastSelectedIndex = -1;
  let activeFilter = 'all';
  let searchQuery = '';
  let currentPage = 1;
  let hasMore = true;
  let isLoading = false;
  let totalCount = 0;
  let previewElement = null;
  let previewTimer = null;
  let previewOwner = null;
  let previewPinned = false;
  let previewExpanded = false;
  let previewCustomSize = null; // { width, height } when user resizes
  let previewResizeState = null;
  let previewResizeBound = false;
  const limit = 50;
  const PREVIEW_MIN_WIDTH = 300;
  const PREVIEW_MIN_HEIGHT = 200;
  /** Varsayılan (kompakt) önizleme üst genişlik — büyütünce neredeyse tam pencere */
  const PREVIEW_COMPACT_MAX_WIDTH = 520;

  /**
   * Modülü başlatır ve olay dinleyicilerini tanımlar
   */
  const DEFAULT_FILTER_ORDER = ['all', 'pinned', 'favorites', 'text', 'image', 'url', 'email', 'code'];

  function init() {
    setupEventListeners();
    setupContextMenuActions();
    applyClipboardFilterOrder();
    setupFilterDrag();
    applyOpenFilter();
    loadHistory(false);
  }

  function parseFilterOrder(raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) return [...DEFAULT_FILTER_ORDER];
      const valid = new Set(DEFAULT_FILTER_ORDER);
      const cleaned = parsed.filter((key) => valid.has(key));
      DEFAULT_FILTER_ORDER.forEach((key) => {
        if (!cleaned.includes(key)) cleaned.push(key);
      });
      return cleaned;
    } catch (_) {
      return [...DEFAULT_FILTER_ORDER];
    }
  }

  /** Persist / restore filter chip order in the clipboard toolbar. */
  function applyClipboardFilterOrder() {
    if (!elements.filters) return;
    const settings = window.App && window.App.settings;
    const order = parseFilterOrder(settings && settings.clipboardFilterOrder);
    const buttons = Array.from(elements.filters.querySelectorAll('.filter-btn'));
    const byKey = Object.fromEntries(buttons.map((b) => [b.dataset.filter, b]));
    const separator = elements.filters.querySelector('.filter-separator');

    order.forEach((key) => {
      if (byKey[key]) elements.filters.appendChild(byKey[key]);
      if (key === 'favorites' && separator) elements.filters.appendChild(separator);
    });
  }

  async function saveClipboardFilterOrder(buttons) {
    const order = buttons.map((b) => b.dataset.filter).filter(Boolean);
    // Keep separator after favorites if present
    const separator = elements.filters.querySelector('.filter-separator');
    const fav = elements.filters.querySelector('.filter-btn[data-filter="favorites"]');
    if (separator && fav && fav.nextSibling !== separator) {
      elements.filters.insertBefore(separator, fav.nextSibling);
    }
    try {
      if (window.api && window.api.saveSetting) {
        await window.api.saveSetting('clipboardFilterOrder', JSON.stringify(order));
      }
      if (window.App && window.App.settings) {
        window.App.settings.clipboardFilterOrder = JSON.stringify(order);
      }
    } catch (err) {
      console.error('clipboardFilterOrder save failed:', err);
    }
  }

  function setupFilterDrag() {
    if (!elements.filters || !window.Utils || !Utils.enableFilterTabDrag) return;
    Utils.enableFilterTabDrag(elements.filters, {
      onReorder: (buttons) => saveClipboardFilterOrder(buttons),
    });
  }

  /**
   * Olay dinleyicilerini kurar
   */
  function setupEventListeners() {
    // Filtre barda fare tekerleğiyle yatay kaydırma (horizontal scroll)
    elements.filters.addEventListener('wheel', (e) => {
      e.preventDefault();
      elements.filters.scrollLeft += e.deltaY;
    });

    // Filtre butonları
    elements.filters.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      // Ignore click that ends a drag (browser may still fire click)
      if (btn.classList.contains('filter-btn-dragging')) return;

      // Aktif sınıfını güncelle
      elements.filters.querySelectorAll('.filter-btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });

      const filter = btn.dataset.filter;
      handleFilterChange(filter);
    });

    elements.list.addEventListener('click', (e) => {
      const clearBtn = e.target.closest('[data-clear-clipboard-filters]');
      if (!clearBtn) return;
      clearAllListFilters();
    });

    // Sonsuz kaydırma (Infinite Scroll)
    elements.list.addEventListener('scroll', () => {
      hideQuickPreview();
      if (isLoading || !hasMore) return;

      const { scrollTop, scrollHeight, clientHeight } = elements.list;
      // Alt sınıra 50px kala yeni verileri çek
      if (scrollHeight - scrollTop - clientHeight < 50) {
        currentPage++;
        loadHistory(true);
      }
    });

    // Temizle Butonu
    elements.clearBtn.addEventListener('click', () => {
      handleClearHistory();
    });

    // Seçim Modu Butonları
    elements.selectBtn?.addEventListener('click', () => {
      toggleSelectionMode(!isSelectionMode);
    });
    elements.cancelSelectionBtn?.addEventListener('click', () => {
      toggleSelectionMode(false);
    });
    elements.selectAllCheckbox?.addEventListener('change', (e) => {
      toggleSelectAll(e.target.checked);
    });
    elements.deleteSelectedBtn?.addEventListener('click', () => {
      deleteSelectedItems();
    });

    document.addEventListener('keydown', (e) => {
      if (!isSelectionMode) return;
      if (e.key === 'Escape') {
        toggleSelectionMode(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        const allSelected = selectedItemIds.size === historyItems.length && historyItems.length > 0;
        toggleSelectAll(!allSelected);
      }
    });

    // Arama Girişi
    const performSearch = Utils.debounce((query) => {
      setSearch(query);
    }, 250);

    elements.search.addEventListener('input', (e) => {
      const query = e.target.value;
      if (query.trim().length > 0) {
        elements.searchClear.classList.add('visible');
      } else {
        elements.searchClear.classList.remove('visible');
      }
      performSearch(query);
    });

    // Arama Temizleme
    elements.searchClear.addEventListener('click', () => {
      elements.search.value = '';
      elements.searchClear.classList.remove('visible');
      setSearch('');
      elements.search.focus();
    });

    // IPC Olayı: Main process'ten yeni clipboard öğesi bildirimi
    window.api.onClipboardChanged((item) => {
      handleNewItem(item);
    });

    elements.advancedFilterBtn?.addEventListener('click', () => {
      const active = elements.advancedFilters.classList.toggle('active');
      elements.advancedFilterBtn.setAttribute('aria-expanded', String(active));
    });
    const applyAdvancedFilters = Utils.debounce(() => {
      updateAdvancedFilterCount();
      loadHistory(false);
    }, 250);
    [elements.filterPeriod, elements.filterLength, elements.filterSensitive].forEach((element) => {
      element?.addEventListener('change', applyAdvancedFilters);
    });
    elements.filterSource?.addEventListener('input', applyAdvancedFilters);
    elements.filterReset?.addEventListener('click', () => {
      elements.filterPeriod.value = '0';
      elements.filterSource.value = '';
      elements.filterLength.value = 'any';
      elements.filterSensitive.value = 'any';
      updateAdvancedFilterCount();
      loadHistory(false);
    });

    if (window.api.onHistoryCleaned) {
      window.api.onHistoryCleaned(() => {
        loadHistory(false, true);
      });
    }

    if (window.api.onWindowVisibilityChanged) {
      window.api.onWindowVisibilityChanged(({ visible }) => {
        if (visible) {
          if (applyOpenFilter()) {
            loadHistory(false);
          }
          return;
        }
        clearSearchOnHide();
      });
    }

    setupModalEventListeners();
  }

  /**
   * Clears clipboard search when the window is hidden if enabled.
   */
  function clearSearchOnHide() {
    const settings = window.App && window.App.settings;
    if (!settings || settings.clearSearchOnHide !== 'true' || !searchQuery) return;

    elements.search.value = '';
    elements.searchClear.classList.remove('visible');
    searchQuery = '';
    loadHistory(false);
  }

  /**
   * Applies the configured filter whenever the clipboard window opens.
   */
  function applyOpenFilter() {
    const settings = window.App && window.App.settings;
    const filter = settings && settings.clipboardOpenFilter;
    const allowedFilters = new Set([
      'all',
      'pinned',
      'favorites',
      'text',
      'image',
      'url',
      'email',
      'code',
    ]);

    if (!filter || filter === 'preserve' || !allowedFilters.has(filter)) return false;
    if (activeFilter === filter) return false;

    activeFilter = filter;
    elements.filters.querySelectorAll('.filter-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.filter === filter);
      button.setAttribute('aria-selected', String(button.dataset.filter === filter));
    });
    return true;
  }

  /**
   * Pano geçmişini veritabanından yükler
   */
  async function loadHistory(append = false, keepScroll = false) {
    if (isLoading) return;
    isLoading = true;

    // Mevcut scroll pozisyonunu sakla
    const savedScrollTop = elements.list.scrollTop;

    if (!append) {
      currentPage = 1;
      hasMore = true;
      // Yükleniyor durumunda skeleton göster (keepScroll aktifken gösterme ki titreme olmasın)
      if (!keepScroll) {
        showSkeleton();
      }
    }

    try {
      const params = {
        page: currentPage,
        limit: limit,
        search: searchQuery,
      };
      params.recentDays = elements.filterPeriod?.value || '0';
      params.sourceApp = elements.filterSource?.value.trim() || '';
      params.length = elements.filterLength?.value || 'any';
      params.sensitive = elements.filterSensitive?.value || 'any';

      // Filtre parametrelerini eşle
      if (activeFilter === 'pinned') {
        params.pinned = true;
        params.type = 'all';
      } else if (activeFilter === 'favorites') {
        params.favorite = true;
        params.type = 'all';
      } else {
        params.type = activeFilter;
      }

      const response = await window.api.getClipboardHistory(params);

      if (response && response.success) {
        const { items, total } = response.data;
        
        hasMore = items.length === limit;
        
        if (append) {
          historyItems = [...historyItems, ...items];
        } else {
          historyItems = items;
        }

        renderHistory(append, keepScroll, savedScrollTop);
        updateCounters(total);
      } else {
        console.error('Pano geçmişi yüklenemedi:', response?.error);
        Utils.showToast(window.i18n ? window.i18n.t('toast.historyLoadFailed') : 'Pano geçmişi yüklenemedi', 'error');
      }
    } catch (err) {
      console.error('loadHistory hatası:', err);
      Utils.showToast(window.i18n ? window.i18n.t('toast.genericError') : 'Bir hata oluştu', 'error');
    } finally {
      isLoading = false;
    }
  }

  /**
   * Arama sorgusunu günceller ve listeyi yeniler
   */
  function setSearch(query) {
    searchQuery = query;
    loadHistory(false);
  }

  /**
   * Filtreyi günceller ve listeyi yeniler
   */
  function handleFilterChange(filter) {
    activeFilter = filter;
    loadHistory(false);
  }

  /**
   * Sayı sayaçlarını ve durum çubuğunu günceller
   */
  function updateCounters(total) {
    if (typeof total === 'number' && Number.isFinite(total)) {
      totalCount = Math.max(0, total);
    }
    elements.count.textContent = totalCount;

    // app.js'teki global durum güncellemesini tetikle
    if (window.App && typeof window.App.updateStatusBar === 'function') {
      window.App.updateStatusBar();
    }
  }

  function adjustTotalCount(delta) {
    totalCount = Math.max(0, totalCount + delta);
    updateCounters();
  }

  function hasActiveListFilters() {
    return Boolean(
      searchQuery
      || activeFilter !== 'all'
      || (elements.filterPeriod && elements.filterPeriod.value !== '0')
      || (elements.filterSource && elements.filterSource.value.trim())
      || (elements.filterLength && elements.filterLength.value !== 'any')
      || (elements.filterSensitive && elements.filterSensitive.value !== 'any')
    );
  }

  function clearAllListFilters() {
    elements.search.value = '';
    elements.searchClear.classList.remove('visible');
    searchQuery = '';
    activeFilter = 'all';
    elements.filters.querySelectorAll('.filter-btn').forEach((button) => {
      const active = button.dataset.filter === 'all';
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    if (elements.filterPeriod) elements.filterPeriod.value = '0';
    if (elements.filterSource) elements.filterSource.value = '';
    if (elements.filterLength) elements.filterLength.value = 'any';
    if (elements.filterSensitive) elements.filterSensitive.value = 'any';
    elements.advancedFilters?.classList.remove('active');
    elements.advancedFilterBtn?.setAttribute('aria-expanded', 'false');
    updateAdvancedFilterCount();
    loadHistory(false);
  }

  /**
   * Çoklu seçim modunu açar veya kapatır
   */
  function toggleSelectionMode(enable) {
    isSelectionMode = enable;
    selectedItemIds.clear();
    lastSelectedIndex = -1;
    elements.selectBtn?.classList.toggle('active', isSelectionMode);
    elements.selectionBar?.classList.toggle('hidden', !isSelectionMode);
    updateSelectionBarUI();
    renderHistory(false, true, elements.list ? elements.list.scrollTop : 0);
  }

  /**
   * Seçim çubuğu arayüzünü günceller
   */
  function updateSelectionBarUI() {
    const count = selectedItemIds.size;
    const text = window.i18n
      ? window.i18n.t('selection.selectedCount', { count })
      : `${count} öğe seçildi`;
    if (elements.selectedCount) elements.selectedCount.textContent = text;
    if (elements.deleteSelectedBtn) {
      elements.deleteSelectedBtn.disabled = count === 0;
    }
    if (elements.selectAllCheckbox) {
      const totalVisible = historyItems.length;
      elements.selectAllCheckbox.checked = totalVisible > 0 && count === totalVisible;
      elements.selectAllCheckbox.indeterminate = count > 0 && count < totalVisible;
    }
  }

  /**
   * Tüm görünür öğeleri seçer veya seçimi kaldırır
   */
  function toggleSelectAll(checked) {
    if (checked) {
      historyItems.forEach((item) => selectedItemIds.add(Number(item.id)));
    } else {
      selectedItemIds.clear();
    }
    updateSelectionBarUI();
    if (elements.list) {
      elements.list.querySelectorAll('.clip-item').forEach((el) => {
        const id = Number(el.dataset.id);
        const isSel = selectedItemIds.has(id);
        el.classList.toggle('is-selected', isSel);
        const chk = el.querySelector('.clip-item-checkbox');
        if (chk) chk.checked = isSel;
      });
    }
  }

  /**
   * Tekil pano öğesi seçimini değiştirir (Shift+Tık ile aralık seçimi destekler)
   */
  function toggleItemSelection(id, shiftKey = false, clickedIndex = -1) {
    const numId = Number(id);
    if (shiftKey && lastSelectedIndex !== -1 && clickedIndex !== -1) {
      const start = Math.min(lastSelectedIndex, clickedIndex);
      const end = Math.max(lastSelectedIndex, clickedIndex);
      for (let i = start; i <= end; i++) {
        if (historyItems[i]) selectedItemIds.add(Number(historyItems[i].id));
      }
    } else {
      if (selectedItemIds.has(numId)) {
        selectedItemIds.delete(numId);
      } else {
        selectedItemIds.add(numId);
      }
    }
    if (clickedIndex !== -1) {
      lastSelectedIndex = clickedIndex;
    }
    updateSelectionBarUI();

    if (elements.list) {
      elements.list.querySelectorAll('.clip-item').forEach((el) => {
        const itemId = Number(el.dataset.id);
        const isSel = selectedItemIds.has(itemId);
        el.classList.toggle('is-selected', isSel);
        const chk = el.querySelector('.clip-item-checkbox');
        if (chk) chk.checked = isSel;
      });
    }
  }

  /**
   * Seçili tüm pano öğelerini veritabanından ve diskten topluca siler
   */
  async function deleteSelectedItems() {
    const ids = Array.from(selectedItemIds);
    if (ids.length === 0) return;

    const title = window.i18n ? window.i18n.t('confirm.deleteSelectedTitle') : 'Seçilen Öğeleri Sil';
    const msg = window.i18n
      ? window.i18n.t('confirm.deleteSelectedMsg', { count: ids.length })
      : `Seçilen ${ids.length} pano geçmişi öğesini silmek istediğinize emin misiniz?`;

    const confirmed = await window.App.confirm(title, msg, Utils.Icons.trash);
    if (!confirmed) return;

    try {
      let res;
      if (window.api && typeof window.api.deleteClipboardItemsBatch === 'function') {
        res = await window.api.deleteClipboardItemsBatch(ids);
      }

      // Fallback: Ana süreç henüz yeniden başlatılmadıysa veya 'No handler registered' hatası dönerse tekil silme kanalını kullan
      if (!res || (!res.success && res.error && String(res.error).includes('No handler registered'))) {
        let deletedCount = 0;
        for (const id of ids) {
          const singleRes = await window.api.deleteClipboardItem(id);
          if (singleRes && singleRes.success) deletedCount++;
        }
        res = { success: true, data: { deleted: deletedCount } };
      }

      if (res && res.success) {
        const count = res.data?.deleted != null ? res.data.deleted : ids.length;
        const toastMsg = window.i18n
          ? window.i18n.t('toast.itemsDeleted', { count })
          : `${count} öğe silindi`;
        Utils.showToast(toastMsg, 'info');
        selectedItemIds.clear();
        toggleSelectionMode(false);
        loadHistory(false);
      } else {
        Utils.showToast(res?.error || 'Silme işlemi başarısız', 'error');
      }
    } catch (err) {
      // IPC henüz kaydedilmediyse (Hot reload / henüz restart edilmemiş uygulama) sessizce tekil kanala geç
      if (err && err.message && String(err.message).includes('No handler registered')) {
        try {
          let deletedCount = 0;
          for (const id of ids) {
            const singleRes = await window.api.deleteClipboardItem(id);
            if (singleRes && singleRes.success) deletedCount++;
          }
          const toastMsg = window.i18n
            ? window.i18n.t('toast.itemsDeleted', { count: deletedCount })
            : `${deletedCount} öğe silindi`;
          Utils.showToast(toastMsg, 'info');
          selectedItemIds.clear();
          toggleSelectionMode(false);
          loadHistory(false);
          return;
        } catch (fallbackErr) {
          console.error('Tekil silme fallback hatası:', fallbackErr);
        }
      } else {
        console.error('Toplu silme hatası:', err);
      }
      Utils.showToast('Silme işlemi sırasında hata oluştu', 'error');
    }
  }

  /**
   * Skeleton yükleme efekti gösterir
   */
  function showSkeleton() {
    elements.list.innerHTML = Array(5).fill(0).map(() => `
      <div class="clip-item skeleton skeleton-clip">
        <div class="clip-item-left">
          <div class="clip-item-icon skeleton-icon"></div>
        </div>
        <div class="clip-item-body skeleton-body">
          <div class="skeleton-line skeleton-line-primary"></div>
          <div class="skeleton-line skeleton-line-secondary"></div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Pano geçmişini DOM'a çizer
   */
  function renderHistory(append = false, keepScroll = false, savedScroll = 0) {
    if (historyItems.length === 0) {
      const filtered = hasActiveListFilters();
      const title = filtered
        ? (window.i18n ? window.i18n.t('empty.clipboardFilteredTitle') : 'Sonuç bulunamadı')
        : (window.i18n ? window.i18n.t('empty.clipboardTitle') : 'Pano Geçmişi Boş');
      const text = filtered
        ? (window.i18n ? window.i18n.t('empty.clipboardFilteredText') : 'Arama veya filtrelerle eşleşen öğe yok. Filtreleri temizleyip tekrar deneyin.')
        : (window.i18n ? window.i18n.t('empty.clipboardText') : 'Kopyaladığınız öğeler burada görünecektir.');
      const clearLabel = window.i18n ? window.i18n.t('empty.clearFilters') : 'Filtreleri Temizle';
      elements.list.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">${Utils.Icons.clipboard}</span>
          <p class="empty-state-title">${title}</p>
          <p class="empty-state-text">${text}</p>
          ${filtered ? `<button type="button" class="btn btn-default empty-state-action" data-clear-clipboard-filters>${clearLabel}</button>` : ''}
        </div>
      `;
      return;
    }

    let lastGroup = null;
    if (append && elements.list) {
      const existingHeaders = elements.list.querySelectorAll('.date-group-header');
      if (existingHeaders.length > 0) {
        lastGroup = existingHeaders[existingHeaders.length - 1].textContent.trim();
      }
    }
    const fragment = document.createDocumentFragment();

    historyItems.forEach((item) => {
      // Arama yoksa ve özel filtreler (sabit/favori) seçilmediyse tarihsel gruplama yap
      if (!searchQuery && activeFilter !== 'pinned' && activeFilter !== 'favorites') {
        const group = Utils.getDateGroup(item.created_at);
        if (group !== lastGroup) {
          lastGroup = group;
          const groupHeader = document.createElement('div');
          groupHeader.className = 'date-group-header';
          groupHeader.textContent = group;
          fragment.appendChild(groupHeader);
        }
      }

      const itemEl = createItemElement(item);
      fragment.appendChild(itemEl);
    });

    if (!append) {
      // replaceChildren, innerHTML = '' + appendChild işlemine göre çok daha performanslıdır ve titremeyi (flicker) önler
      elements.list.replaceChildren(fragment);
    } else {
      // Önceki skeleton veya yükleniyor göstergelerini temizle
      const skeletons = elements.list.querySelectorAll('.skeleton');
      skeletons.forEach(s => s.remove());
      elements.list.appendChild(fragment);
    }

    // Yeni liste yüklemesinde (append değilse) scroll durumunu belirle
    if (!append) {
      if (keepScroll) {
        elements.list.scrollTop = savedScroll;
      } else {
        elements.list.scrollTop = 0;
      }
    }
  }

  /**
   * Tek bir pano öğesi öğesini DOM nesnesi olarak oluşturur
   */
  function createItemElement(item) {
    const el = document.createElement('div');
    const isLongText = item.content_type !== 'image' && item.content && (item.content.length > 120 || item.content.includes('\n'));
    const isSelected = selectedItemIds.has(Number(item.id));
    el.className = `clip-item ${item.is_pinned ? 'pinned' : ''} ${isLongText ? 'has-expand' : ''} ${isSelected ? 'is-selected' : ''}`;
    el.dataset.id = item.id;
    el.dataset.type = item.content_type;
    el.setAttribute('tabindex', '0');

    let checkboxHTML = '';
    if (isSelectionMode) {
      checkboxHTML = `
        <div class="clip-item-checkbox-container">
          <input type="checkbox" class="clip-item-checkbox" ${isSelected ? 'checked' : ''} tabindex="-1">
        </div>
      `;
    }

    // İçerik önizleme veya görsel önizleme
    let contentHTML = '';
    if (item.content_type === 'image' && item.image_path) {
      // Windows dosya yollarını local-file URL'ine çevir (güvenle yüklenmesi için)
      const fileUrl = 'local-file:///' + item.image_path.replace(/\\/g, '/');
      contentHTML = `
        <img class="clip-item-image-preview" src="${fileUrl}" alt="${window.i18n ? window.i18n.t('imageItem.alt') : 'Görsel Pano'}" onerror="this.src='../assets/image-error.png';">
      `;
    } else {
      // Arama yapılmışsa eşleşen kısımları vurgula
      let previewText = item.content || '';
      if (item.content_type === 'html') {
        previewText = previewText.replace(/<[^>]*>/g, '');
      }

      
      // Hassas veri ise gizle
      if (item.is_sensitive) {
        previewText = window.i18n ? window.i18n.t('sensitive.placeholder') : '•••••••••••• (Hassas Veri)';
        el.classList.add('sensitive');
      }

      const highlighted = searchQuery && !item.is_sensitive
        ? Utils.highlightText(previewText, searchQuery)
        : Utils.escapeHtml(previewText);

      contentHTML = `<div class="clip-item-preview">${highlighted}</div>`;
    }

    const typeLabel = Utils.getContentTypeLabel(item.content_type);
    const dateLabel = Utils.timeAgo(item.created_at);
    const primaryActionLabel = item.content_type === 'image'
      ? (window.i18n ? window.i18n.t('btn.copy') : 'Kopyala')
      : (window.i18n ? window.i18n.t('btn.paste') : 'Yapıştır');
    const primaryActionTooltip = item.content_type === 'image'
      ? (window.i18n ? window.i18n.t('tooltip.copy') : 'Panoya kopyala')
      : (window.i18n ? window.i18n.t('tooltip.pasteHint') : 'Aktif pencereye yapıştır (Enter veya çift tık)');
    const quickActions = getQuickActions();

    // Durum rozetleri (pin/fav)
    let badgesHTML = '';
    if (item.is_pinned || item.is_favorite) {
      badgesHTML = `<div class="clip-status-badges">`;
      if (item.is_pinned) badgesHTML += `<span class="status-badge pin-badge" data-tooltip="${window.i18n ? window.i18n.t('tooltip.pinned') : 'Sabitlenmiş'}">${Utils.Icons.pin}</span>`;
      if (item.is_favorite) badgesHTML += `<span class="status-badge fav-badge" data-tooltip="${window.i18n ? window.i18n.t('tooltip.favorited') : 'Favori'}">${Utils.Icons.star}</span>`;
      badgesHTML += `</div>`;
    }

    // Hızlı önizleme (göz) — Space ayarından bağımsız her zaman erişilebilir
    const previewLabel = window.i18n ? window.i18n.t('tooltip.quickPreview') : 'Hızlı Önizleme';
    const previewBtnHTML = `<button class="clip-action-btn preview-btn eye-action-btn" data-tooltip="${previewLabel}" aria-label="${previewLabel}" type="button">${Utils.Icons.eye}</button>`;

    // Hassas veri maske kaldır butonu (kilit ikonu — göz önizlemeden ayrı)
    let sensitiveBtnHTML = '';
    if (item.is_sensitive) {
      sensitiveBtnHTML = `<button class="clip-action-btn sensitive-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.showContent') : 'İçeriği Göster'}" aria-label="${window.i18n ? window.i18n.t('tooltip.showContent') : 'Hassas içeriği göster veya gizle'}">${Utils.Icons.lock}</button>`;
    }

    // Uzun metinler için genişletme butonu (chevron-down)
    let expandBtnHTML = '';
    if (isLongText) {
      const chevronDownIcon = `<svg class="icon-svg expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      expandBtnHTML = `<button class="clip-action-btn expand-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.expand') : 'Genişlet'}" aria-label="${window.i18n ? window.i18n.t('tooltip.expand') : 'Genişlet'}">${chevronDownIcon}</button>`;
    }

    el.innerHTML = `
      ${checkboxHTML}
      <div class="clip-item-left">
        <div class="clip-item-icon">
          ${Utils.getContentTypeIcon(item.content_type)}
        </div>
      </div>
      <div class="clip-item-body">
        ${contentHTML}
        ${isLongText ? `
          <button type="button" class="accordion-view-more" data-tooltip="${window.i18n ? window.i18n.t('tooltip.viewMore') : 'Devamını Gör'}" aria-label="${window.i18n ? window.i18n.t('tooltip.viewMore') : 'Devamını Gör'}">
            <span>${window.i18n ? window.i18n.t('note.viewMore') : 'Devamını Gör'}</span>
            <svg class="icon-svg" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
        ` : ''}
        <div class="clip-item-meta">
          <span class="type-badge">${typeLabel}</span>
          <span class="clip-date">${dateLabel}</span>
        </div>
      </div>
      <div class="clip-item-actions">
        ${previewBtnHTML}
        ${sensitiveBtnHTML}
        <button class="clip-action-btn clip-primary-action paste-btn" data-tooltip="${primaryActionTooltip}" aria-label="${primaryActionTooltip}">
          ${item.content_type === 'image' ? Utils.Icons.copy : Utils.Icons.paste}
          <span>${primaryActionLabel}</span>
          ${item.content_type === 'image' ? '' : '<kbd>Enter</kbd>'}
        </button>
        ${renderQuickActionButtons(item, quickActions)}
      </div>
      ${expandBtnHTML}
    `;

    bindItemEvents(el, item);
    return el;
  }

  /**
   * Pano geçmişi üzerindeki olayları bağlar
   */
  function bindItemEvents(el, item) {
    el.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      el.focus();
      await window.api.showClipboardContextMenu({
        id: item.id,
        type: item.content_type,
        isPinned: Boolean(item.is_pinned),
        isFavorite: Boolean(item.is_favorite),
      });
    });
    // Klavye navigasyonu (Ok tuşları ile odaklanma, Enter ile yapıştırma, Space ile kopyalama)
    el.addEventListener('keydown', async (e) => {
      if (e.target !== el) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        // Primary action: images copy to clipboard; text pastes into the target window
        if (item.content_type === 'image') {
          await copyToSystemClipboard(item, el);
        } else {
          await pasteToActiveWindow(item);
        }
      } else if (e.key === ' ') {
        const spaceAction = window.App?.settings?.spaceKeyAction || 'copy';
        // Workspace switch is handled globally in app.js
        if (spaceAction === 'workspace') return;
        e.preventDefault();
        if (e.repeat) return;
        if (spaceAction === 'preview') {
          if (item.content_type === 'image' && item.image_path) {
            openImageViewer(item.image_path);
          } else {
            toggleQuickPreview(item, el);
          }
        } else {
          await copyToSystemClipboard(item, el);
        }
      } else if (!e.repeat && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        await copyToSystemClipboard(item, el);
      } else if (!e.repeat && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        await toggleItemPin(item, el);
      } else if (!e.repeat && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        await toggleItemFavorite(item, el);
      } else if (!e.repeat && e.key.toLowerCase() === 'n' && item.content_type !== 'image') {
        e.preventDefault();
        await saveItemAsNote(item);
      } else if (!e.repeat && e.key === 'Delete') {
        e.preventDefault();
        await deleteItem(item, el);
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const cards = [...elements.list.querySelectorAll('.clip-item')];
        cards[Math.min(cards.length - 1, cards.indexOf(el) + 1)]?.focus();
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const cards = [...elements.list.querySelectorAll('.clip-item')];
        cards[Math.max(0, cards.indexOf(el) - 1)]?.focus();
      }

      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const cards = [...elements.list.querySelectorAll('.clip-item')];
        (e.key === 'Home' ? cards[0] : cards[cards.length - 1])?.focus();
      }
    });

    // Kartı daraltan akıllı yardımcı fonksiyon (parlama efekti ve hassas kaydırma dahil)
    function collapseCard() {
      if (!el.classList.contains('accordion-open')) return;

      el.classList.remove('accordion-open');
      const icon = el.querySelector('.expand-icon');
      if (icon) icon.style.transform = 'rotate(0deg)';
      const expBtn = el.querySelector('.expand-btn');
      if (expBtn) expBtn.setAttribute('data-tooltip', window.i18n ? window.i18n.t('tooltip.expand') : 'Genişlet');

      // 1. requestAnimationFrame ile tarayıcının yeni boyut hesaplamasını yakala ve kusursuz kaydır
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      });

      // 2. Kullanıcı gözünü karta odaklamak için hafif ve şık parlama efekti tetikle
      el.classList.add('collapse-highlight');
      el.addEventListener('animationend', () => {
        el.classList.remove('collapse-highlight');
      }, { once: true });
    }

    // Pano işleyişi (notlardan farklı — başlık yok):
    // - Alt ortadaki ok: yalnızca akordiyon aç/kapa
    // - Tek tık (ayar): hızlı önizleme
    // - Çift tık (ayar): yapıştır — açıkken tek tık gecikmeli
    // - Görsel: tek tık görüntüleyici
    // Checkbox doğrudan tıklandığında olay kabarmasını durdur ve seçimi kararlı şekilde değiştir
    const chkInput = el.querySelector('.clip-item-checkbox');
    if (chkInput) {
      chkInput.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemIndex = historyItems.findIndex(i => String(i.id) === String(item.id));
        toggleItemSelection(item.id, e.shiftKey, itemIndex);
      });
    }

    let singleClickTimer = null;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.clip-item-checkbox-container')) return;

      if (isSelectionMode) {
        e.preventDefault();
        e.stopPropagation();
        const itemIndex = historyItems.findIndex(i => String(i.id) === String(item.id));
        toggleItemSelection(item.id, e.shiftKey, itemIndex);
        return;
      }

      if (e.target.closest('.clip-action-btn') ||
          e.target.closest('.accordion-view-more')) return;

      el.focus({ preventScroll: true });

      if (item.content_type === 'image' && item.image_path && e.detail === 1) {
        openImageViewer(item.image_path);
        return;
      }

      const s = window.App?.settings || {};
      const openOnClick = s.clipboardClickOpensPreview != null && s.clipboardClickOpensPreview !== ''
        ? s.clipboardClickOpensPreview !== 'false'
        : s.expandedClickOpensModal !== 'false';
      if (!openOnClick || e.detail !== 1) return;

      // Metin seçiliyse önizleme açma
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;

      const dblPaste = s.clipboardDoubleClickPaste !== 'false';
      clearTimeout(singleClickTimer);
      if (dblPaste) {
        // Çift tık yapıştırmayla çakışmasın diye kısa gecikme
        singleClickTimer = setTimeout(() => {
          singleClickTimer = null;
          openPinnedQuickPreview(item, el);
        }, 220);
      } else {
        openPinnedQuickPreview(item, el);
      }
    });

    // Çift tıklama: Görseller hariç öğeyi doğrudan aktif pencereye yapıştırır
    el.addEventListener('dblclick', async (e) => {
      if (e.target.closest('.clip-action-btn') || e.target.closest('.clip-item-preview')) return;
      if (item.content_type === 'image') return;
      clearTimeout(singleClickTimer);
      singleClickTimer = null;
      if (window.App?.settings?.clipboardDoubleClickPaste === 'false') return;
      await pasteToActiveWindow(item);
    });

    // Genişlet/Daralt butonu olayını bağla
    const expandBtn = el.querySelector('.expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const isOpen = el.classList.contains('accordion-open');
        if (isOpen) {
          collapseCard();
        } else {
          // Diğerlerini kapat
          document.querySelectorAll('.clip-item.accordion-open').forEach(itemEl => {
            if (itemEl !== el) {
              itemEl.classList.remove('accordion-open');
              const itemIcon = itemEl.querySelector('.expand-icon');
              if (itemIcon) itemIcon.style.transform = 'rotate(0deg)';
              const itemExp = itemEl.querySelector('.expand-btn');
              if (itemExp) itemExp.setAttribute('data-tooltip', window.i18n ? window.i18n.t('tooltip.expand') : 'Genişlet');
            }
          });
          el.classList.add('accordion-open');
          expandBtn.setAttribute('data-tooltip', window.i18n ? window.i18n.t('tooltip.collapse') : 'Daralt');
          const icon = expandBtn.querySelector('.expand-icon');
          if (icon) icon.style.transform = 'rotate(180deg)';
        }
      });
    }

    // Devamını Gör butonu -> Space ile aynı sabit hızlı önizlemeyi aç
    const viewMoreBtn = el.querySelector('.accordion-view-more');
    if (viewMoreBtn) {
      viewMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPinnedQuickPreview(item, el);
      });
    }

    // Göz butonu -> hızlı önizleme (Space ayarından bağımsız)
    const previewBtn = el.querySelector('.preview-btn');
    if (previewBtn) {
      previewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.content_type === 'image' && item.image_path) {
          openImageViewer(item.image_path);
        } else {
          toggleQuickPreview(item, el);
        }
      });
    }

    // Hassas veri maske göster/gizle butonu
    const sensitiveBtn = el.querySelector('.sensitive-btn');
    if (sensitiveBtn) {
      let isRevealed = false;
      let revealedContent = null;
      sensitiveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        isRevealed = !isRevealed;
        
        const previewEl = el.querySelector('.clip-item-preview');
        if (previewEl) {
          if (isRevealed) {
            if (!revealedContent) {
              sensitiveBtn.disabled = true;
              try {
                const res = await window.api.revealSensitiveContent(item.id);
                if (res && res.success) {
                  revealedContent = res.data;
                } else {
                  isRevealed = false;
                  Utils.showToast((window.i18n ? window.i18n.t('toast.contentDecryptFailed') : 'İçerik çözülemedi') + ': ' + (res?.error || 'Bilinmeyen hata'), 'error');
                  sensitiveBtn.disabled = false;
                  return;
                }
              } catch (err) {
                console.error(err);
                isRevealed = false;
                Utils.showToast(window.i18n ? window.i18n.t('toast.contentDecryptFailed') : 'İçerik çözülemedi', 'error');
                sensitiveBtn.disabled = false;
                return;
              }
              sensitiveBtn.disabled = false;
            }
            previewEl.textContent = revealedContent;
            sensitiveBtn.innerHTML = Utils.Icons.eyeOff;
            sensitiveBtn.setAttribute('data-tooltip', window.i18n ? window.i18n.t('tooltip.hideContent') : 'İçeriği Gizle');
          } else {
            revealedContent = null;
            previewEl.textContent = window.i18n ? window.i18n.t('sensitive.placeholder') : '•••••••••••• (Hassas Veri)';
            sensitiveBtn.innerHTML = Utils.Icons.lock;
            sensitiveBtn.setAttribute('data-tooltip', window.i18n ? window.i18n.t('tooltip.showContent') : 'İçeriği Göster');
          }
        }
      });
    }




    // Yapıştır butonu
    const pasteBtn = el.querySelector('.paste-btn');
    if (pasteBtn) {
      pasteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await pasteToActiveWindow(item);
      });
    }

    // Kopyala butonu
    const copyBtn = el.querySelector('.copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyToSystemClipboard(item, el);
    });

    // Pin butonu
    const pinBtn = el.querySelector('.pin-btn');
    if (pinBtn) pinBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await window.api.togglePinClipboard(item.id);
        if (response && response.success) {
          const updatedItem = response.data;

          // Güncellenen öğeyi hafızadaki listede güncelle
          const idx = historyItems.findIndex(h => h.id === item.id);
          if (idx !== -1) {
            historyItems[idx] = updatedItem;
          }

          // Eğer 'pinned' filtresindeysek ve artık pinli değilse, kartı uçur
          if (activeFilter === 'pinned' && !updatedItem.is_pinned) {
            el.style.animation = 'slideOut 0.2s ease forwards';
            el.addEventListener('animationend', () => {
              el.remove();
              const idxLocal = historyItems.findIndex((h) => h.id === item.id);
              if (idxLocal !== -1) historyItems.splice(idxLocal, 1);
              adjustTotalCount(-1);
            }, { once: true });
          } else {
            // Sadece bu kartın DOM'unu güncelle (yeniden yükleme/flicker olmadan)
            updateItemDOM(el, updatedItem);
          }
        }
      } catch (err) {
        console.error('Pin hatası:', err);
      }
    });

    // Favori butonu
    const favBtn = el.querySelector('.fav-btn');
    if (favBtn) favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await window.api.toggleFavoriteClipboard(item.id);
        if (response && response.success) {
          const updatedItem = response.data;
          favBtn.classList.toggle('fav-active', updatedItem.is_favorite);
          favBtn.setAttribute('data-tooltip', updatedItem.is_favorite ? (window.i18n ? window.i18n.t('tooltip.unfavorite') : 'Favorilerden Çıkar') : (window.i18n ? window.i18n.t('tooltip.favorite') : 'Favorilere Ekle'));
          
          if (updatedItem.is_favorite) {
            favBtn.classList.add('fav-animate');
            favBtn.addEventListener('animationend', () => favBtn.classList.remove('fav-animate'), { once: true });
          }

          // Güncellenen öğeyi hafızadaki listede güncelle
          const idx = historyItems.findIndex(h => h.id === item.id);
          if (idx !== -1) {
            historyItems[idx] = updatedItem;
          }

          // Eğer 'favorites' filtresindeysek ve artık favori değilse, kartı uçur
          if (activeFilter === 'favorites' && !updatedItem.is_favorite) {
            el.style.animation = 'slideOut 0.2s ease forwards';
            el.addEventListener('animationend', () => {
              el.remove();
              const idxLocal = historyItems.findIndex((h) => h.id === item.id);
              if (idxLocal !== -1) historyItems.splice(idxLocal, 1);
              adjustTotalCount(-1);
            }, { once: true });
          } else {
            // Sadece bu kartın DOM'unu güncelle (yeniden yükleme/flicker olmadan)
            updateItemDOM(el, updatedItem);
          }
        }

      } catch (err) {
        console.error('Favori hatası:', err);
      }
    });

    // Not yapma butonu — editörü önceden doldurur, kullanıcı kategori/başlık seçer
    const noteBtn = el.querySelector('.note-btn');
    if (noteBtn) noteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await saveItemAsNote(item);
    });

    // Sil butonu
    const deleteBtn = el.querySelector('.delete-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      let preview = item.content || '';
      if (item.content_type === 'image') {
        preview = window.i18n ? window.i18n.t('imageItem.label') : 'Görsel Öğesi';
      } else {
        preview = Utils.truncate(preview, 50);
      }
      
      const confirmed = await window.App.confirm(
        window.i18n ? window.i18n.t('confirm.deleteItemTitle') : 'Öğeyi Sil',
        window.i18n ? window.i18n.t('confirm.deleteItemMsg', { preview }) : `"${preview}" içeriğine sahip pano geçmişi öğesini silmek istediğinize emin misiniz?`,
        Utils.Icons.trash
      );
      
      if (!confirmed) return;

      try {
        const response = await window.api.deleteClipboardItem(item.id);
        if (response && response.success) {
          // Kartı uçurma animasyonu verip sil
          el.style.animation = 'slideOut 0.2s ease forwards';
          el.addEventListener('animationend', () => {
            el.remove();
            // Local listeden kaldır
            const idx = historyItems.findIndex(h => h.id === item.id);
            if (idx !== -1) {
              historyItems.splice(idx, 1);
            }
            adjustTotalCount(-1);
          }, { once: true });
          Utils.showToast(window.i18n ? window.i18n.t('toast.itemDeleted') : 'Öğe silindi', 'info');
          // Yetim görselleri asenkron temizle
          window.api.cleanupOrphanImages().catch(err => console.error(err));
        }
      } catch (err) {
        console.error('Silme hatası:', err);
      }
    });

    el.addEventListener('mouseenter', () => {
      elements.list.querySelectorAll('.clip-item.hover-focused').forEach((card) => {
        if (card !== el) card.classList.remove('hover-focused');
      });
      el.classList.add('hover-focused');
      // Fare üzerindeyken kartı seç — Space ile hemen açılabilsin
      Utils.hoverSelectCard(el);
    });

    el.addEventListener('mouseleave', () => {
      el.classList.remove('hover-focused');
    });
  }

  /**
   * Öğeyi sistem panosuna kopyalar
   */
  async function copyToSystemClipboard(item, element) {
    return copyItem(item, false);
  }

  function updateAdvancedFilterCount() {
    const count = [
      elements.filterPeriod?.value !== '0',
      Boolean(elements.filterSource?.value.trim()),
      elements.filterLength?.value !== 'any',
      elements.filterSensitive?.value !== 'any',
    ].filter(Boolean).length;
    if (elements.advancedFilterCount) {
      elements.advancedFilterCount.textContent = count ? String(count) : '';
    }
    elements.advancedFilterBtn?.classList.toggle('active', count > 0);
  }

  async function copyItem(item, plainText, options = {}) {
    const silent = options.silent === true;
    try {
      let response;
      if (item.is_sensitive) {
        response = await window.api.copyToClipboard({
          id: item.id,
          ignoreChange: false,
          plainText,
        });
      } else {
        let contentToCopy = item.content;
        let copyType = item.content_type;
        if (copyType === 'image') {
          contentToCopy = item.image_path;
        }
        response = await window.api.copyToClipboard({
          content: contentToCopy,
          type: copyType,
          ignoreChange: false,
          plainText,
        });
      }
      
      if (response && response.success) {
        if (!silent) {
          Utils.showToast(window.i18n ? window.i18n.t('toast.copied') : 'Panoya kopyalandı!', 'success');
        }
      } else {
        Utils.showToast((window.i18n ? window.i18n.t('toast.copyFailed') : 'Kopyalanamadı') + ': ' + response?.error, 'error');
      }
    } catch (err) {
      console.error('copyToSystemClipboard hatası:', err);
      Utils.showToast(window.i18n ? window.i18n.t('toast.copyFailed') : 'Kopyalama başarısız', 'error');
    }
  }

  /**
   * Öğeyi aktif pencereye yapıştırır
   */
  async function pasteToActiveWindow(item) {
    return pasteItem(item, false);
  }

  async function pasteItem(item, plainText) {
    try {
      if (item.content_type === 'image') {
        // Copy silently, then explain how to complete paste in the target app
        await copyItem(item, false, { silent: true });
        Utils.showToast(
          window.i18n
            ? window.i18n.t('toast.pasteImageInfo')
            : 'Görsel panoya kopyalandı. Hedef uygulamada Ctrl+V kullanın.',
          'info'
        );
        return;
      }

      let response;
      if (item.is_sensitive) {
        response = await window.api.pasteToActiveWindow({ id: item.id, plainText });
      } else {
        response = await window.api.pasteToActiveWindow({
          content: item.content,
          type: item.content_type,
          plainText,
        });
      }

      if (!response || !response.success) {
        Utils.showToast((window.i18n ? window.i18n.t('toast.pasteFailed') : 'Yapıştırma başarısız') + ': ' + response?.error, 'error');
      }
    } catch (err) {
      console.error('pasteToActiveWindow hatası:', err);
      Utils.showToast(window.i18n ? window.i18n.t('toast.pasteFailed') : 'Yapıştırma başarısız', 'error');
    }
  }

  function getQuickActions() {
    const fallback = ['copy', 'pin', 'favorite', 'note', 'delete'];
    let enabled = fallback;
    let order = fallback;
    try {
      const stored = window.App && window.App.settings && window.App.settings.clipboardQuickActions;
      const parsed = JSON.parse(stored || JSON.stringify(fallback));
      enabled = Array.isArray(parsed) ? parsed : fallback;
    } catch (err) {
      enabled = fallback;
    }
    try {
      const parsed = JSON.parse(window.App?.settings?.clipboardQuickActionOrder || '[]');
      if (Array.isArray(parsed)) {
        order = [...new Set([...parsed.filter((action) => fallback.includes(action)), ...fallback])];
      }
    } catch {}
    const enabledSet = new Set(enabled);
    return order.filter((action) => enabledSet.has(action));
  }

  function renderQuickActionButtons(item, quickActions) {
    const factories = {
      copy: () => item.content_type === 'image' ? '' : `<button class="clip-action-btn copy-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.copy') : 'Kopyala'}" aria-label="${window.i18n ? window.i18n.t('tooltip.copy') : 'Kopyala'}">${Utils.Icons.copy}</button>`,
      pin: () => `<button class="clip-action-btn pin-btn ${item.is_pinned ? 'pin-active' : ''}" data-tooltip="${item.is_pinned ? (window.i18n ? window.i18n.t('tooltip.unpin') : 'Sabitlemeyi Kaldır') : (window.i18n ? window.i18n.t('tooltip.pin') : 'Sabitle')}" aria-label="${item.is_pinned ? (window.i18n ? window.i18n.t('tooltip.unpin') : 'Sabitlemeyi kaldır') : (window.i18n ? window.i18n.t('tooltip.pin') : 'Sabitle')}">${Utils.Icons.pin}</button>`,
      favorite: () => `<button class="clip-action-btn fav-btn ${item.is_favorite ? 'fav-active' : ''}" data-tooltip="${item.is_favorite ? (window.i18n ? window.i18n.t('tooltip.unfavorite') : 'Favorilerden Çıkar') : (window.i18n ? window.i18n.t('tooltip.favorite') : 'Favorilere Ekle')}" aria-label="${item.is_favorite ? (window.i18n ? window.i18n.t('tooltip.unfavorite') : 'Favorilerden çıkar') : (window.i18n ? window.i18n.t('tooltip.favorite') : 'Favorilere ekle')}">${Utils.Icons.star}</button>`,
      note: () => item.content_type === 'image' ? '' : `<button class="clip-action-btn note-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.saveAsNote') : 'Not Olarak Kaydet'}" aria-label="${window.i18n ? window.i18n.t('tooltip.saveAsNote') : 'Not olarak kaydet'}">${Utils.Icons.fileText}</button>`,
      delete: () => `<button class="clip-action-btn delete-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.delete') : 'Sil'}" aria-label="${window.i18n ? window.i18n.t('tooltip.delete') : 'Sil'}">${Utils.Icons.trash}</button>`,
    };
    return quickActions.map((action) => factories[action]?.() || '').join('');
  }

  function setupContextMenuActions() {
    if (!window.api.onClipboardContextAction) return;
    window.api.onClipboardContextAction(({ action, id }) => {
      const item = historyItems.find((candidate) => candidate.id === id);
      const element = elements.list.querySelector(`.clip-item[data-id="${id}"]`);
      if (!item || !element) return;
      executeItemAction(action, item, element);
    });
  }

  async function executeItemAction(action, item, element) {
    switch (action) {
      case 'paste':
        await pasteItem(item, false);
        break;
      case 'pastePlain':
        await pasteItem(item, true);
        break;
      case 'copy':
        await copyItem(item, false);
        break;
      case 'copyPlain':
        await copyItem(item, true);
        break;
      case 'details':
        if (item.content_type === 'image' && item.image_path) {
          openImageViewer(item.image_path);
        } else {
          openClipDetailModal(item);
        }
        break;
      case 'pin':
        element.querySelector('.pin-btn')?.click();
        if (!element.querySelector('.pin-btn')) {
          await toggleItemPin(item, element);
        }
        break;
      case 'favorite':
        element.querySelector('.fav-btn')?.click();
        if (!element.querySelector('.fav-btn')) {
          await toggleItemFavorite(item, element);
        }
        break;
      case 'note':
        element.querySelector('.note-btn')?.click();
        if (!element.querySelector('.note-btn')) {
          await saveItemAsNote(item);
        }
        break;
      case 'delete':
        element.querySelector('.delete-btn')?.click();
        if (!element.querySelector('.delete-btn')) {
          await deleteItem(item, element);
        }
        break;
    }
  }

  function ensureQuickPreview() {
    if (previewElement) return previewElement;
    previewElement = document.createElement('aside');
    previewElement.className = 'clipboard-quick-preview';
    previewElement.setAttribute('role', 'dialog');
    previewElement.setAttribute('aria-label', window.i18n ? window.i18n.t('preview.title') : 'Hızlı Önizleme');
    previewElement.addEventListener('pointerdown', () => {
      clearTimeout(previewTimer);
    });
    previewElement.addEventListener('mouseenter', () => {
      clearTimeout(previewTimer);
    });
    previewElement.addEventListener('mouseleave', () => {
      if (previewResizeState) return;
      previewTimer = setTimeout(() => {
        if (!previewPinned) hideQuickPreview();
      }, 220);
    });
    previewElement.addEventListener('keydown', (event) => {
      if (event.key === 'f' || event.key === 'F') {
        if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
        event.preventDefault();
        event.stopPropagation();
        togglePreviewExpanded();
        return;
      }
      if (event.key !== 'Escape' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      const owner = previewOwner;
      hideQuickPreview();
      owner?.focus();
    });
    // Uygulama içinde önizleme dışına (boş alan, başka kart, toolbar…) tıklayınca kapat
    // capture: alt öğeler stopPropagation etse bile yakalanır
    document.addEventListener('pointerdown', (event) => {
      if (!previewElement?.classList.contains('visible')) return;
      if (previewResizeState) return;
      if (previewElement.contains(event.target)) return;
      const owner = previewOwner;
      hideQuickPreview();
      // Odak önizlemeden sonra makul bir yere dönsün
      if (owner?.isConnected && typeof owner.focus === 'function') {
        try { owner.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    }, true);
    if (!previewResizeBound) {
      previewResizeBound = true;
      // Ana pencere büyüyünce/küçülünce (maximize dahil) önizlemeyi yeniden ölçekle
      window.addEventListener('resize', scheduleQuickPreviewRelayout);
      window.visualViewport?.addEventListener('resize', scheduleQuickPreviewRelayout);
      document.addEventListener('pointermove', onPreviewResizeMove);
      document.addEventListener('pointerup', onPreviewResizeEnd);
      document.addEventListener('pointercancel', onPreviewResizeEnd);
    }
    document.body.appendChild(previewElement);
    return previewElement;
  }

  function toggleQuickPreview(item, owner) {
    if (previewElement?.classList.contains('visible') && previewOwner === owner) {
      hideQuickPreview();
      return;
    }
    openPinnedQuickPreview(item, owner);
  }

  function openPinnedQuickPreview(item, owner) {
    previewPinned = true;
    showQuickPreview(item, owner);
    previewElement?.querySelector('.clipboard-quick-preview-body')?.focus({ preventScroll: true });
  }

  function showQuickPreview(item, owner) {
    if (!owner?.isConnected) return;
    const preview = ensureQuickPreview();
    const typeLabel = Utils.getContentTypeLabel(item.content_type);
    let content = '';
    let details = '';
    const expandLabel = window.i18n
      ? window.i18n.t(previewExpanded ? 'preview.restore' : 'preview.expand')
      : (previewExpanded ? 'Varsayılan boyuta dön' : 'Büyüt');
    const closeLabel = window.i18n ? window.i18n.t('preview.close') : 'Kapat';
    const resizeLabel = window.i18n ? window.i18n.t('preview.resizeHandle') : 'Boyutu ayarla';

    if (item.content_type === 'image' && item.image_path) {
      const fileUrl = 'local-file:///' + item.image_path.replace(/\\/g, '/');
      content = `
        <div class="clipboard-quick-preview-image-wrap">
          <img class="clipboard-quick-preview-image" src="${fileUrl}" alt="${window.i18n ? window.i18n.t('imageItem.alt') : 'Görsel'}">
        </div>`;
    } else {
      let text = item.content || '';
      if (item.is_sensitive) {
        text = window.i18n ? window.i18n.t('sensitive.placeholder') : '••••••••••••';
        content = `<div class="clipboard-quick-preview-sensitive">${Utils.Icons.lock || Utils.Icons.eye} ${Utils.escapeHtml(text)}</div>`;
      } else if (item.content_type === 'url') {
        content = renderUrlPreview(text);
      } else if (item.content_type === 'email') {
        content = renderEmailPreview(text);
      } else if (item.content_type === 'code') {
        content = renderCodePreview(text);
      } else if (item.content_type === 'html') {
        content = renderHtmlPreview(text);
      } else {
        content = `<div class="clipboard-quick-preview-text">${Utils.escapeHtml(text)}</div>`;
      }
    }

    const metadata = [];
    if (item.source_app) metadata.push(Utils.escapeHtml(item.source_app));
    if (item.char_count) {
      metadata.push(`${Number(item.char_count).toLocaleString()} ${window.i18n ? window.i18n.t('preview.characters') : 'karakter'}`);
    }
    metadata.push(Utils.escapeHtml(Utils.timeAgo(item.created_at)));
    details = metadata.filter(Boolean).map((value) => `<span>${value}</span>`).join('');

    preview.innerHTML = `
      <div class="clipboard-quick-preview-header">
        <span>${Utils.getContentTypeIcon(item.content_type)} ${typeLabel}</span>
        <span class="clipboard-quick-preview-tools">
          <kbd title="Space">Space</kbd>
          ${item.content_type === 'image' ? '' : `<button class="clip-action-btn" data-preview-copy type="button" aria-label="${window.i18n ? window.i18n.t('tooltip.copy') : 'Kopyala'}">${Utils.Icons.copy}</button>`}
          <button class="clip-action-btn" data-preview-expand type="button" aria-label="${expandLabel}" data-tooltip="${expandLabel}" title="${expandLabel}">${previewExpanded ? Utils.Icons.restore : Utils.Icons.maximize}</button>
          <button class="clip-action-btn clipboard-quick-preview-close" data-preview-close type="button" aria-label="${closeLabel}" data-tooltip="${closeLabel}" title="${closeLabel}">${Utils.Icons.close}</button>
        </span>
      </div>
      <div class="clipboard-quick-preview-body" tabindex="0">${content}</div>
      <div class="clipboard-quick-preview-footer">${details}</div>
      <div class="clipboard-quick-preview-resize" data-preview-resize role="separator" aria-orientation="both" aria-label="${resizeLabel}" title="${resizeLabel}"></div>
    `;
    preview.querySelector('[data-preview-open-url]')?.addEventListener('click', () => {
      window.api.openExternal(item.content);
    });
    preview.querySelector('[data-preview-copy]')?.addEventListener('click', async (event) => {
      event.stopPropagation();
      await copyItem(item, false);
      preview.querySelector('.clipboard-quick-preview-body')?.focus();
    });
    preview.querySelector('[data-preview-expand]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      togglePreviewExpanded();
    });
    preview.querySelector('[data-preview-close]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const owner = previewOwner;
      hideQuickPreview();
      owner?.focus();
    });
    preview.querySelector('[data-preview-resize]')?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      startPreviewResize(event);
    });

    previewOwner = owner;
    preview.classList.toggle('is-expanded', previewExpanded);
    preview.classList.toggle('is-custom-size', Boolean(previewCustomSize));
    preview.classList.add('visible');
    // visible olduktan sonra ölç — alt kenar pencere dışına taşmasın
    positionQuickPreview(preview, owner);
    requestAnimationFrame(() => {
      if (previewElement?.classList.contains('visible')) positionQuickPreview(previewElement, previewOwner);
    });
  }

  function togglePreviewExpanded() {
    if (!previewElement?.classList.contains('visible')) return;
    previewPinned = true;
    previewExpanded = !previewExpanded;
    // Fullscreen-style expand drops freeform size; restore returns to compact defaults.
    previewCustomSize = null;
    previewElement.classList.toggle('is-expanded', previewExpanded);
    previewElement.classList.remove('is-custom-size');
    const expandBtn = previewElement.querySelector('[data-preview-expand]');
    if (expandBtn) {
      const expandLabel = window.i18n
        ? window.i18n.t(previewExpanded ? 'preview.restore' : 'preview.expand')
        : (previewExpanded ? 'Varsayılan boyuta dön' : 'Büyüt');
      expandBtn.innerHTML = previewExpanded ? Utils.Icons.restore : Utils.Icons.maximize;
      expandBtn.setAttribute('aria-label', expandLabel);
      expandBtn.setAttribute('data-tooltip', expandLabel);
      expandBtn.setAttribute('title', expandLabel);
    }
    positionQuickPreview(previewElement, previewOwner);
    previewElement.querySelector('.clipboard-quick-preview-body')?.focus({ preventScroll: true });
  }

  function startPreviewResize(event) {
    if (!previewElement?.classList.contains('visible')) return;
    previewPinned = true;
    const rect = previewElement.getBoundingClientRect();
    previewResizeState = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      pointerId: event.pointerId,
    };
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // ignore capture failures
    }
    document.body.classList.add('is-resizing-preview');
  }

  function onPreviewResizeMove(event) {
    if (!previewResizeState || !previewElement) return;
    const margin = 10;
    const maxWidth = Math.max(PREVIEW_MIN_WIDTH, window.innerWidth - margin * 2);
    const maxHeight = Math.max(PREVIEW_MIN_HEIGHT, window.innerHeight - margin * 2);
    const nextWidth = Math.min(
      maxWidth,
      Math.max(PREVIEW_MIN_WIDTH, previewResizeState.startWidth + (event.clientX - previewResizeState.startX))
    );
    const nextHeight = Math.min(
      maxHeight,
      Math.max(PREVIEW_MIN_HEIGHT, previewResizeState.startHeight + (event.clientY - previewResizeState.startY))
    );
    previewCustomSize = { width: nextWidth, height: nextHeight };
    previewExpanded = false;
    previewElement.classList.remove('is-expanded');
    previewElement.classList.add('is-custom-size');
    positionQuickPreview(previewElement, previewOwner);
  }

  function onPreviewResizeEnd() {
    if (!previewResizeState) return;
    previewResizeState = null;
    document.body.classList.remove('is-resizing-preview');
  }

  let previewRelayoutRaf = 0;

  /**
   * Ana pencere boyutu değişince (maximize/restore/resize) önizlemeyi
   * not detay modalı gibi viewport’a göre yeniden uygular.
   */
  function scheduleQuickPreviewRelayout() {
    if (!previewElement?.classList.contains('visible')) return;
    if (previewRelayoutRaf) cancelAnimationFrame(previewRelayoutRaf);
    previewRelayoutRaf = requestAnimationFrame(() => {
      previewRelayoutRaf = 0;
      relayoutQuickPreview();
      // Maximize sonrası ikinci layout turu (boyut bazen iki adımda oturur)
      requestAnimationFrame(() => {
        if (previewElement?.classList.contains('visible')) relayoutQuickPreview();
      });
    });
  }

  function relayoutQuickPreview() {
    if (!previewElement?.classList.contains('visible')) return;
    if (previewCustomSize) {
      const margin = 10;
      previewCustomSize = {
        width: Math.min(previewCustomSize.width, window.innerWidth - margin * 2),
        height: Math.min(previewCustomSize.height, window.innerHeight - margin * 2),
      };
    }
    positionQuickPreview(previewElement, previewOwner);
  }

  function positionQuickPreview(preview, owner) {
    // Büyüt: 8px kenar; varsayılan: 12px. Her zaman ana pencere içinde kalır.
    const margin = previewExpanded && !previewCustomSize ? 8 : 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxWidth = Math.max(PREVIEW_MIN_WIDTH, vw - margin * 2);
    const maxHeight = Math.max(PREVIEW_MIN_HEIGHT, vh - margin * 2);

    // display:none iken scrollHeight 0/yanlış olur — ölçüm için geçici göster
    const computedDisplay = window.getComputedStyle(preview).display;
    const needsTempMeasure = computedDisplay === 'none';
    if (needsTempMeasure) {
      preview.style.visibility = 'hidden';
      preview.style.display = 'flex';
    }

    let width;
    let height;

    if (previewCustomSize) {
      const customMargin = 10;
      const customMaxW = Math.max(PREVIEW_MIN_WIDTH, vw - customMargin * 2);
      const customMaxH = Math.max(PREVIEW_MIN_HEIGHT, vh - customMargin * 2);
      width = Math.min(customMaxW, Math.max(PREVIEW_MIN_WIDTH, previewCustomSize.width));
      height = Math.min(customMaxH, Math.max(PREVIEW_MIN_HEIGHT, previewCustomSize.height));
    } else if (previewExpanded) {
      // Büyüt: ana pencereyi neredeyse doldur (kompakt ile net fark)
      width = maxWidth;
      height = maxHeight;
    } else {
      // Kompakt varsayılan: okunaklı kart boyutu; pencere küçülürse sığdır
      width = Math.min(PREVIEW_COMPACT_MAX_WIDTH, maxWidth);
      preview.style.minHeight = '';
      preview.style.width = `${Math.round(width)}px`;
      preview.style.maxWidth = `${Math.round(width)}px`;
      preview.style.height = '';
      preview.style.maxHeight = `${maxHeight}px`;
      // Layout’u zorla, sonra gerçek yüksekliği oku ve sabitle (taşmayı önler)
      void preview.offsetHeight;
      height = Math.min(Math.max(preview.scrollHeight || PREVIEW_MIN_HEIGHT, PREVIEW_MIN_HEIGHT), maxHeight);
    }

    // Sert clamp — asla viewport dışına çıkmasın
    width = Math.min(Math.max(PREVIEW_MIN_WIDTH, width), maxWidth);
    height = Math.min(Math.max(PREVIEW_MIN_HEIGHT, height), maxHeight);

    preview.style.width = `${Math.round(width)}px`;
    preview.style.maxWidth = `${Math.round(width)}px`;
    preview.style.height = `${Math.round(height)}px`;
    preview.style.maxHeight = `${Math.round(height)}px`;
    preview.style.minHeight = '';

    let left = Math.round((vw - width) / 2);
    let top = Math.round((vh - height) / 2);
    left = Math.max(margin, Math.min(left, vw - margin - width));
    top = Math.max(margin, Math.min(top, vh - margin - height));

    // Alt/sağ taşma son güvenlik ağı
    if (left + width > vw - margin) left = Math.max(margin, vw - margin - width);
    if (top + height > vh - margin) top = Math.max(margin, vh - margin - height);

    preview.style.left = `${Math.round(left)}px`;
    preview.style.top = `${Math.round(top)}px`;

    if (needsTempMeasure) {
      preview.style.visibility = '';
      preview.style.display = '';
    }
  }

  function hideQuickPreview() {
    clearTimeout(previewTimer);
    if (previewRelayoutRaf) {
      cancelAnimationFrame(previewRelayoutRaf);
      previewRelayoutRaf = 0;
    }
    onPreviewResizeEnd();
    if (previewElement) {
      previewElement.classList.remove('visible', 'is-expanded', 'is-custom-size');
      previewElement.style.width = '';
      previewElement.style.maxWidth = '';
      previewElement.style.height = '';
      previewElement.style.maxHeight = '';
      previewElement.style.minHeight = '';
      previewElement.style.left = '';
      previewElement.style.top = '';
    }
    previewOwner = null;
    previewPinned = false;
    previewExpanded = false;
    previewCustomSize = null;
  }

  function htmlToPreviewText(value) {
    const documentValue = new DOMParser().parseFromString(value, 'text/html');
    documentValue.querySelectorAll('script, style').forEach((node) => node.remove());
    return documentValue.body.textContent?.trim() || '';
  }

  function renderUrlPreview(value) {
    try {
      const url = new URL(value);
      const pathValue = `${url.pathname}${url.search}${url.hash}`;
      return `
        <div class="clipboard-preview-structured">
          <div class="clipboard-preview-domain">${Utils.Icons.link}<strong>${Utils.escapeHtml(url.hostname)}</strong></div>
          <dl>
            <div><dt>${window.i18n ? window.i18n.t('preview.protocol') : 'Protokol'}</dt><dd>${Utils.escapeHtml(url.protocol.replace(':', '').toUpperCase())}</dd></div>
            <div><dt>${window.i18n ? window.i18n.t('preview.address') : 'Adres'}</dt><dd>${Utils.escapeHtml(pathValue || '/')}</dd></div>
          </dl>
          <button class="btn btn-default clipboard-preview-open" data-preview-open-url type="button">${Utils.Icons.externalLink || Utils.Icons.link} ${window.i18n ? window.i18n.t('preview.openLink') : 'Bağlantıyı Aç'}</button>
        </div>`;
    } catch {
      return `<div class="clipboard-quick-preview-text">${Utils.escapeHtml(value)}</div>`;
    }
  }

  function renderEmailPreview(value) {
    const [localPart, domain = ''] = String(value).trim().split('@');
    return `
      <div class="clipboard-preview-structured">
        <div class="clipboard-preview-domain">${Utils.Icons.email}<strong>${Utils.escapeHtml(value)}</strong></div>
        <dl>
          <div><dt>${window.i18n ? window.i18n.t('preview.mailbox') : 'Posta kutusu'}</dt><dd>${Utils.escapeHtml(localPart || '')}</dd></div>
          <div><dt>${window.i18n ? window.i18n.t('preview.domain') : 'Alan adı'}</dt><dd>${Utils.escapeHtml(domain)}</dd></div>
        </dl>
      </div>`;
  }

  function renderCodePreview(value) {
    const language = detectCodeLanguage(value);
    return `
      <div class="clipboard-preview-code-header">${Utils.escapeHtml(language)}</div>
      <pre class="clipboard-preview-code"><code>${highlightCode(value)}</code></pre>`;
  }

  function detectCodeLanguage(value) {
    const text = String(value);
    if (/<\/?[a-z][\s\S]*>/i.test(text)) return 'HTML / XML';
    if (/\b(const|let|var|function|async|await|console\.)\b/.test(text)) return 'JavaScript';
    if (/\b(def|import|from|print|elif|None|True|False)\b/.test(text)) return 'Python';
    if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/i.test(text)) return 'SQL';
    if (/\b(class|public|private|static|void|namespace|using)\b/.test(text)) return 'C# / Java';
    if (/^\s*[{[]/.test(text) && /"\s*:/.test(text)) return 'JSON';
    if (/\b(Get-|Set-|New-|Write-Host|Select-Object)\w*/.test(text)) return 'PowerShell';
    return window.i18n ? window.i18n.t('preview.code') : 'Kod';
  }

  function highlightCode(value) {
    let escaped = Utils.escapeHtml(String(value));
    escaped = escaped.replace(/(&quot;.*?&quot;|'.*?'|`.*?`)/g, '<span class="syntax-string">$1</span>');
    escaped = escaped.replace(/\b(const|let|var|function|return|if|else|for|while|class|async|await|def|import|from|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|true|false|null|None)\b/g, '<span class="syntax-keyword">$1</span>');
    escaped = escaped.replace(/(^|\s)(\/\/.*|#.*)$/gm, '$1<span class="syntax-comment">$2</span>');
    return escaped;
  }

  function renderHtmlPreview(value) {
    const text = htmlToPreviewText(value);
    return `
      <div class="clipboard-preview-html-label">${window.i18n ? window.i18n.t('preview.safeHtml') : 'Güvenli metin görünümü'}</div>
      <div class="clipboard-quick-preview-text">${Utils.escapeHtml(text)}</div>`;
  }

  async function toggleItemPin(item, element) {
    const response = await window.api.togglePinClipboard(item.id);
    if (!response || !response.success) return;
    // Quiet toggle — visual pin state is enough feedback
    await loadHistory(false, true);
  }

  async function toggleItemFavorite(item, element) {
    const response = await window.api.toggleFavoriteClipboard(item.id);
    if (!response || !response.success) return;
    // Quiet toggle — star animation/badge is enough feedback
    await loadHistory(false, true);
  }

  async function saveItemAsNote(item) {
    if (item.content_type === 'image') {
      Utils.showToast(
        window.i18n ? window.i18n.t('toast.clipToNoteImage') : 'Görseller not olarak kaydedilemez',
        'warning'
      );
      return;
    }

    let content = item.content || '';
    if (item.is_sensitive) {
      try {
        const revealed = await window.api.revealSensitiveContent(item.id);
        if (!revealed?.success) {
          Utils.showToast(
            (window.i18n ? window.i18n.t('toast.clipToNoteFailed') : 'Nota aktarılamadı') + ': ' + (revealed?.error || ''),
            'error'
          );
          return;
        }
        content = revealed.data || '';
      } catch (err) {
        Utils.showToast(window.i18n ? window.i18n.t('toast.clipToNoteFailed') : 'Nota aktarılamadı', 'error');
        return;
      }
    }

    if (item.content_type === 'html') {
      content = content
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();
    }

    const titleSource = (item.preview || content || '').replace(/\s+/g, ' ').trim();
    const title = Utils.truncate(titleSource, 50);

    if (window.NotesPanel && typeof window.NotesPanel.openEditorFromClipboard === 'function') {
      await window.App?.setWorkspaceMode?.('notes', true);
      window.NotesPanel.openEditorFromClipboard({ title, content });
      return;
    }

    Utils.showToast(window.i18n ? window.i18n.t('toast.clipToNoteFailed') : 'Nota aktarılamadı', 'error');
  }

  async function deleteItem(item, element) {
    const preview = item.content_type === 'image'
      ? (window.i18n ? window.i18n.t('imageItem.label') : 'Görsel Öğesi')
      : Utils.truncate(item.content || '', 50);
    const confirmed = await window.App.confirm(
      window.i18n ? window.i18n.t('confirm.deleteItemTitle') : 'Öğeyi Sil',
      window.i18n ? window.i18n.t('confirm.deleteItemMsg', { preview }) : `"${preview}" öğesini silmek istediğinize emin misiniz?`,
      Utils.Icons.trash
    );
    if (!confirmed) return;

    const response = await window.api.deleteClipboardItem(item.id);
    if (response && response.success) {
      Utils.showToast(window.i18n ? window.i18n.t('toast.itemDeleted') : 'Öğe silindi', 'info');
      await loadHistory(false, true);
      window.api.cleanupOrphanImages().catch((err) => console.error(err));
    }
  }

  /**
   * Main process'ten yeni bir veri geldiğinde listeye ekler
   */
  function handleNewItem(item) {
    // Same image (or same text) already at top — skip rebuild
    if (historyItems.length > 0) {
      const top = historyItems[0];
      if (top.id === item.id) return;
      if (
        top.content_type === item.content_type
        && top.content_type === 'image'
        && top.content_hash
        && top.content_hash === item.content_hash
      ) {
        return;
      }
      if (top.content === item.content && top.content_type === item.content_type) {
        return;
      }
    }

    // Filtre kontrolü
    let matchesFilter = true;
    if (activeFilter !== 'all') {
      if (activeFilter === 'pinned' && !item.is_pinned) matchesFilter = false;
      else if (activeFilter === 'favorites' && !item.is_favorite) matchesFilter = false;
      else if (activeFilter !== item.content_type) matchesFilter = false;
    }

    // Arama filtre kontrolü
    if (searchQuery && !item.content.toLowerCase().includes(searchQuery.toLowerCase())) {
      matchesFilter = false;
    }

    // Eğer filtreyle eşleşiyorsa listeyi güncelle
    if (matchesFilter) {
      // Önce varsa eski eşleşmesini kaldır (yinelenen olmasın)
      const existingIdx = historyItems.findIndex(x => x.id === item.id || (x.content === item.content && x.content_type === item.content_type));
      if (existingIdx !== -1) {
        historyItems.splice(existingIdx, 1);
      }

      // En başa ekle
      historyItems.unshift(item);

      // Kronolojik olarak sırala
      historyItems.sort((a, b) => {
        // created_at karşılaştırması: ISO formatındaki tarihleri alfabetik (tersine) kıyaslar.
        if (a.created_at < b.created_at) return 1;
        if (a.created_at > b.created_at) return -1;
        return b.id - a.id;
      });

      // Limit kontrolü
      if (historyItems.length > limit) {
        historyItems = historyItems.slice(0, limit);
      }

      // Listeyi hızlıca ve yanıp sönme (flicker) olmadan renderHistory ile yeniden çiz.
      // replaceChildren kullandığımız için hem date header'lar güncellenir hem de titreme olmaz.
      renderHistory(false, true, elements.list.scrollTop);

      // Yeni eklenen/kopyalanan öğeyi bul ve kopyalama efektini uygula (scroll konumu değiştirilmeden)
      const newEl = elements.list.querySelector(`.clip-item[data-id="${item.id}"]`);
      if (newEl) {
        Utils.copyFlashAnimation(newEl);
      }

      // Sayaçları güncelle
      updateCounters(historyItems.length);
    } else {
      // Eşleşmiyorsa listeyi yenileyip titretmek yerine sadece global durum sayaçlarını güncelliyoruz.
      if (window.App && typeof window.App.updateStatusBar === 'function') {
        window.App.updateStatusBar();
      }
    }
  }

  /**
   * Pano geçmişini temizler
   */
  async function handleClearHistory() {
    // app.js'teki global confirm modalını kullan veya yerel oluştur
    const confirmed = await window.App.confirm(
      window.i18n ? window.i18n.t('confirm.clearHistoryTitle') : 'Geçmişi Temizle',
      window.i18n ? window.i18n.t('confirm.clearHistoryMsg') : 'Sabitlenmemiş tüm pano geçmişini silmek istediğinize emin misiniz? Sabitlenmiş öğeler korunacaktır.',
      Utils.Icons.trash
    );

    if (!confirmed) return;

    try {
      const response = await window.api.clearClipboardHistory();
      if (response && response.success) {
        Utils.showToast(
          window.i18n ? window.i18n.t('toast.historyCleared', { count: response.data.deleted }) : `${response.data.deleted} öğe temizlendi.`,
          'success'
        );
        loadHistory(false);
        // Yetim görselleri asenkron temizle
        window.api.cleanupOrphanImages().catch(err => console.error(err));
      } else {
        Utils.showToast((window.i18n ? window.i18n.t('toast.historyClearFailed') : 'Temizlenemedi') + ': ' + response?.error, 'error');
      }
    } catch (err) {
      console.error('Pano temizleme hatası:', err);
    }
  }
  /**
   * Pano öğesi DOM kartını tam yenileme yapmadan günceller (Yanıp sönmeyi/flicker engeller)
   */
  function updateItemDOM(el, updatedItem) {
    // 1. Pinned sınıfını güncelle
    if (updatedItem.is_pinned) {
      el.classList.add('pinned');
    } else {
      el.classList.remove('pinned');
    }



    // 3. Pin butonunu güncelle
    const pinBtn = el.querySelector('.pin-btn');
    if (pinBtn) {
      if (updatedItem.is_pinned) {
        pinBtn.classList.add('pin-active');
        pinBtn.setAttribute('data-tooltip', window.i18n ? window.i18n.t('tooltip.unpin') : 'Sabitlemeyi Kaldır');
      } else {
        pinBtn.classList.remove('pin-active');
        pinBtn.setAttribute('data-tooltip', window.i18n ? window.i18n.t('tooltip.pin') : 'Sabitle');
      }
    }

    const favBtn = el.querySelector('.fav-btn');
    if (favBtn) {
      if (updatedItem.is_favorite) {
        favBtn.classList.add('fav-active');
        favBtn.setAttribute('data-tooltip', window.i18n ? window.i18n.t('tooltip.unfavorite') : 'Favorilerden Çıkar');
      } else {
        favBtn.classList.remove('fav-active');
        favBtn.setAttribute('data-tooltip', window.i18n ? window.i18n.t('tooltip.favorite') : 'Favorilere Ekle');
      }
    }
  }

  /**
   * Resimleri tam boyutta görüntüleyen modal
   */
  function openImageViewer(imagePath) {
    let modal = document.getElementById('image-viewer-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'image-viewer-modal';
      modal.className = 'modal-overlay image-viewer-overlay';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', window.i18n ? window.i18n.t('imageItem.alt') : 'Görsel önizleme');
      modal.innerHTML = `
        <div class="modal image-viewer-dialog">
          <div class="image-viewer-stage">
            <button id="image-viewer-close-btn" class="image-viewer-close" type="button" aria-label="${window.i18n ? window.i18n.t('btn.close') : 'Kapat'}">✕</button>
            <img id="image-viewer-img" class="image-viewer-image" src="" alt="Görsel">
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeBtn = modal.querySelector('#image-viewer-close-btn');
      const closeViewer = () => {
        modal.classList.remove('active');
        Utils.destroyFocusTrap(modal);
        window.api?.setModalOpen(false).catch((error) => console.error(error));
      };
      if (closeBtn) closeBtn.addEventListener('click', closeViewer);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeViewer();
      });

      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
          e.preventDefault();
          closeViewer();
        }
      });
    }

    const img = modal.querySelector('#image-viewer-img');
    const fileUrl = 'local-file:///' + imagePath.replace(/\\/g, '/');
    img.src = fileUrl;
    modal.classList.add('active');
    Utils.initFocusTrap(modal);
    window.api?.setModalOpen(true).catch((error) => console.error(error));
    modal.querySelector('#image-viewer-close-btn')?.focus();
  }

  // ═══════════════════════════════════════════════════════════════
  // Pano Detay ve Editör Modalleri Yönetimi
  // ═══════════════════════════════════════════════════════════════

  function setupModalEventListeners() {
    const detailModal = document.getElementById('clip-detail-modal');
    const detailCloseBtn = document.getElementById('clip-detail-close-btn');
    const detailCloseBottomBtn = document.getElementById('clip-detail-close-bottom-btn');
    const editorCloseBtn = document.getElementById('clip-editor-close-btn');
    const editorCancelBtn = document.getElementById('clip-editor-cancel-btn');
    const editorForm = document.getElementById('clip-editor-form');
    const editorSaveBtn = document.getElementById('clip-editor-save-btn');

    if (detailCloseBtn) detailCloseBtn.addEventListener('click', () => closeClipDetailModal());
    if (detailCloseBottomBtn) detailCloseBottomBtn.addEventListener('click', () => closeClipDetailModal());
    // Overlay boşluğuna tıklayınca pano detayını kapat (düzenleme modalına uygulanmaz)
    detailModal?.addEventListener('click', (e) => {
      if (e.target !== detailModal) return;
      closeClipDetailModal();
    });
    if (editorCloseBtn) editorCloseBtn.addEventListener('click', () => closeClipEditorModal());
    if (editorCancelBtn) editorCancelBtn.addEventListener('click', () => closeClipEditorModal());
    if (editorSaveBtn) editorSaveBtn.addEventListener('click', () => saveClipItem());
    if (editorForm) {
      editorForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveClipItem();
      });
    }
  }

  function openClipDetailModal(item) {
    const detailModal = document.getElementById('clip-detail-modal');
    const detailTitle = document.getElementById('clip-detail-title-text');
    const detailContent = document.getElementById('clip-detail-content');
    const detailTypeTag = document.getElementById('clip-detail-type-tag');
    const detailDate = document.getElementById('clip-detail-date');
    const detailEditBtn = document.getElementById('clip-detail-edit-btn');
    const detailCopyBtn = document.getElementById('clip-detail-copy-btn');

    if (!detailModal || !detailContent) return;

    let rawContent = item.content || '';
    
    // Hassas veri ise ve maskesi kaldırıldıysa oradaki çözülmüş içeriği al
    const sensitiveBtn = document.querySelector(`.clip-item[data-id="${item.id}"] .sensitive-btn`);
    const previewEl = document.querySelector(`.clip-item[data-id="${item.id}"] .clip-item-preview`);
    if (item.is_sensitive && sensitiveBtn && previewEl) {
      if (previewEl.textContent !== (window.i18n ? window.i18n.t('sensitive.placeholder') : '•••••••••••• (Hassas Veri)')) {
        rawContent = previewEl.textContent;
      }
    }

    if (detailTitle) {
      detailTitle.textContent = window.i18n ? window.i18n.t('clipDetail.title') : 'Pano Öğesi Detayı';
    }
    detailContent.textContent = rawContent;
    
    if (detailTypeTag) {
      const typeLabel = Utils.getContentTypeLabel(item.content_type);
      detailTypeTag.innerHTML = `
        <span class="note-category-tag ${item.content_type}">
          ${Utils.getContentTypeIcon(item.content_type)} ${typeLabel}
        </span>
      `;
    }

    if (detailDate) {
      detailDate.textContent = Utils.formatDate(item.created_at);
    }

    // Düzenle butonu
    if (detailEditBtn) {
      detailEditBtn.onclick = () => {
        closeClipDetailModal();
        openClipEditorModal(item, rawContent);
      };
    }

    // Kopyala butonu
    if (detailCopyBtn) {
      detailCopyBtn.onclick = async () => {
        try {
          const response = await window.api.copyToClipboard(rawContent, item.content_type, false);
          if (response && response.success) {
            Utils.showToast(window.i18n ? window.i18n.t('toast.copied') : 'Kopyalandı!', 'success');
          }
        } catch (err) {
          console.error(err);
        }
      };
    }

    detailModal.classList.add('active');
    Utils.initFocusTrap(detailModal);
  }

  function closeClipDetailModal() {
    const detailModal = document.getElementById('clip-detail-modal');
    if (detailModal) {
      detailModal.classList.remove('active');
      Utils.destroyFocusTrap(detailModal);
    }
  }

  function openClipEditorModal(item, currentText = null) {
    const editorModal = document.getElementById('clip-editor-modal');
    const editId = document.getElementById('clip-edit-id');
    const editContent = document.getElementById('clip-edit-content');

    if (!editorModal || !editId || !editContent) return;

    editId.value = item.id;
    editContent.value = currentText || item.content || '';
    
    editorModal.classList.add('active');
    Utils.initFocusTrap(editorModal);
  }

  function closeClipEditorModal() {
    const editorModal = document.getElementById('clip-editor-modal');
    const editorForm = document.getElementById('clip-editor-form');
    if (editorModal) {
      editorModal.classList.remove('active');
      Utils.destroyFocusTrap(editorModal);
    }
    if (editorForm) {
      editorForm.reset();
    }
  }

  async function saveClipItem() {
    const editId = document.getElementById('clip-edit-id');
    const editContent = document.getElementById('clip-edit-content');
    
    if (!editId || !editContent) return;

    const id = parseInt(editId.value);
    const content = editContent.value;
    if (!content.trim()) {
      Utils.showToast(window.i18n ? window.i18n.t('toast.contentRequired') : 'İçerik boş bırakılamaz', 'warning');
      return;
    }

    try {
      const res = await window.api.updateClipboardItem(id, content);
      if (res && res.success) {
        Utils.showToast(window.i18n ? window.i18n.t('toast.itemSaved') : 'Öğe başarıyla güncellendi', 'success');
        closeClipEditorModal();
        
        // Pano geçmişini listesini, pozisyonu koruyarak yeniden yükle
        const listEl = document.getElementById('clipboard-list');
        const scrollPos = listEl ? listEl.scrollTop : 0;
        loadHistory(false, true, scrollPos);
      } else {
        Utils.showToast((window.i18n ? window.i18n.t('toast.saveFailed') : 'Kaydedilemedi') + ': ' + (res?.error || 'Bilinmeyen hata'), 'error');
      }
    } catch (err) {
      console.error(err);
      Utils.showToast(window.i18n ? window.i18n.t('toast.saveFailed') : 'Kayıt sırasında bir hata oluştu.', 'error');
    }
  }

  return {
    init,
    loadHistory,
    setSearch,
    handleNewItem,
  };
})();

window.ClipboardPanel = ClipboardPanel;

