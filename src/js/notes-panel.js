/* ═══════════════════════════════════════════════════════════════
   ClipBoardPrime — Notes Panel Module
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const NotesPanel = (() => {
  const elements = {
    list: document.getElementById('notes-list'),
    count: document.getElementById('notes-count'),
    categoryFilter: document.getElementById('notes-category-filters'),
    manageCategoriesBtn: document.getElementById('manage-categories-btn'),
    newNoteBtn: document.getElementById('new-note-btn'),
    search: document.getElementById('notes-search'),
    searchClear: document.getElementById('notes-search-clear'),
    
    // Editor Modal
    editorModal: document.getElementById('note-editor-modal'),
    editorCloseBtn: document.getElementById('note-editor-close-btn'),
    editorExpandBtn: document.getElementById('note-editor-expand-btn'),
    editorCancelBtn: document.getElementById('note-editor-cancel-btn'),
    editorSaveBtn: document.getElementById('note-editor-save-btn'),
    editorForm: document.getElementById('note-editor-form'),
    editId: document.getElementById('note-edit-id'),
    editTitle: document.getElementById('note-edit-title'),
    editContent: document.getElementById('note-edit-content'),
    editCategory: document.getElementById('note-edit-category'),
    categoryPreview: document.getElementById('note-edit-category-preview'),
    noteColorPicker: document.getElementById('note-edit-color-picker'),
    modalTitle: document.getElementById('note-editor-title'),
    
    // Category Manager Modal
    categoryModal: document.getElementById('category-manager-modal'),
    categoryCloseBtn: document.getElementById('category-manager-close-btn'),
    categoryNameInput: document.getElementById('new-category-name'),
    categoryColorInput: document.getElementById('new-category-color-picker'),
    categoryIconInput: document.getElementById('new-category-icon'),
    addCategoryBtn: document.getElementById('add-category-btn'),
    categoryList: document.getElementById('category-list'),

    // Detail Modal
    detailModal: document.getElementById('note-detail-modal'),
    detailDialog: document.getElementById('note-detail-dialog'),
    detailCloseBtn: document.getElementById('note-detail-close-btn'),
    detailCloseBottomBtn: document.getElementById('note-detail-close-bottom-btn'),
    detailExpandBtn: document.getElementById('note-detail-expand-btn'),
    detailResizeHandle: document.getElementById('note-detail-resize'),
    detailTitle: document.getElementById('note-detail-title-text'),
    detailContent: document.getElementById('note-detail-content'),
    detailCategory: document.getElementById('note-detail-category-tag'),
    detailDate: document.getElementById('note-detail-date'),
    detailEditBtn: document.getElementById('note-detail-edit-btn'),
    detailCopyBtn: document.getElementById('note-detail-copy-btn'),
  };

  let notesList = [];
  let categoriesList = [];
  let activeCategoryFilter = '';
  let searchQuery = '';
  let selectedColor = 'charcoal';
  let isDraggingGlobal = false;
  let editorBaseline = null;
  let editorExpanded = false;
  let detailExpanded = false;
  let detailCustomSize = null; // { width, height }
  let detailResizeState = null;
  let detailResizeBound = false;
  const DETAIL_MIN_WIDTH = 320;
  const DETAIL_MIN_HEIGHT = 240;

  /**
   * Varsayılan kategorilerin isimlerini seçili dile göre yerelleştirir
   */
  function getLocalizedCategoryName(name) {
    if (!name) return '';
    const mapping = {
      'Genel': 'category.defaultGenel',
      'İş': 'category.defaultWork',
      'Kod': 'category.defaultCode',
      'Kişisel': 'category.defaultPersonal'
    };
    const key = mapping[name];
    if (key && window.i18n) {
      return window.i18n.t(key);
    }
    return name;
  }

  /**
   * Modülü başlatır ve olay dinleyicilerini tanımlar
   */
  function init() {
    setupEventListeners();
    setupCategoryFilterDrag();
    loadCategories().then(() => {
      applyOpenFilter();
      loadNotes();
    });
  }

  const DEFAULT_NOTES_FILTER_ORDER = ['all', 'pinned', 'favorites'];
  const SYSTEM_FILTER_KEYS = new Set(['all', 'pinned', 'favorites', '']);

  function isUserCategoryFilterButton(btn) {
    if (!btn || !btn.dataset) return false;
    return /^\d+$/.test(String(btn.dataset.category || ''));
  }

  function isNotesFilterButton(btn) {
    return Boolean(btn && btn.classList && btn.classList.contains('filter-btn'));
  }

  function parseNotesFilterOrder(raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) return [...DEFAULT_NOTES_FILTER_ORDER];
      const system = [];
      parsed.forEach((key) => {
        if (key === 'all' || key === 'pinned' || key === 'favorites') {
          if (!system.includes(key)) system.push(key);
        }
      });
      DEFAULT_NOTES_FILTER_ORDER.forEach((key) => {
        if (!system.includes(key)) system.push(key);
      });
      return system;
    } catch (_) {
      return [...DEFAULT_NOTES_FILTER_ORDER];
    }
  }

  async function saveNotesFilterOrder(buttons) {
    // Persist only system chip order; user categories use DB sort_order.
    const systemOrder = buttons
      .map((b) => {
        const v = b.dataset.category;
        if (v === '' || v === undefined) return 'all';
        if (v === 'pinned' || v === 'favorites') return v;
        return null;
      })
      .filter(Boolean);

    // Ensure all system keys present once
    DEFAULT_NOTES_FILTER_ORDER.forEach((key) => {
      if (!systemOrder.includes(key)) systemOrder.push(key);
    });

    const categoryOrder = buttons
      .filter(isUserCategoryFilterButton)
      .map((btn, index) => ({
        id: parseInt(btn.dataset.category, 10),
        sort_order: index,
      }))
      .filter((item) => Number.isFinite(item.id));

    try {
      if (window.api?.saveSetting) {
        await window.api.saveSetting('notesFilterOrder', JSON.stringify(systemOrder));
      }
      if (window.App?.settings) {
        window.App.settings.notesFilterOrder = JSON.stringify(systemOrder);
      }
      if (categoryOrder.length > 0) {
        const byId = new Map(categoriesList.map((c) => [c.id, c]));
        const reordered = [];
        categoryOrder.forEach((item) => {
          const cat = byId.get(item.id);
          if (cat) {
            cat.sort_order = item.sort_order;
            reordered.push(cat);
          }
        });
        if (reordered.length) categoriesList = reordered;

        const response = await window.api.reorderCategories(categoryOrder);
        if (!response || !response.success) {
          Utils.showToast(
            window.i18n ? window.i18n.t('toast.categoryReorderFailed') : 'Kategori sırası kaydedilemedi',
            'error'
          );
          await loadCategories();
        }
      }
    } catch (err) {
      console.error('saveNotesFilterOrder failed:', err);
      await loadCategories();
    }
  }

  function setupCategoryFilterDrag() {
    if (!elements.categoryFilter || !window.Utils || !Utils.enableFilterTabDrag) return;
    Utils.enableFilterTabDrag(elements.categoryFilter, {
      isDraggable: isNotesFilterButton,
      onReorder: (buttons) => saveNotesFilterOrder(buttons),
    });
  }

  function getDefaultCategoryId() {
    return categoriesList.length > 0 ? categoriesList[0].id : null;
  }

  /**
   * Olay dinleyicilerini kurar
   */
  function setupEventListeners() {
    // Kategori filtre seçimi (Sekmeler)
    elements.categoryFilter.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      if (btn.classList.contains('filter-btn-dragging')) return;

      elements.categoryFilter.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      activeCategoryFilter = btn.dataset.category || '';
      loadNotes();
    });

    // Kategori sekmelerinde fare tekerleğiyle yatay kaydırma (horizontal scroll)
    elements.categoryFilter.addEventListener('wheel', (e) => {
      e.preventDefault();
      elements.categoryFilter.scrollLeft += e.deltaY;
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

    if (window.api.onWindowVisibilityChanged) {
      window.api.onWindowVisibilityChanged(({ visible }) => {
        if (!visible && window.App?.settings?.clearNotesSearchOnHide === 'true') {
          elements.search.value = '';
          elements.searchClear.classList.remove('visible');
          setSearch('');
        }
        if (visible && applyOpenFilter()) loadNotes();
      });
    }

    // Yeni Not butonu
    elements.newNoteBtn.addEventListener('click', () => {
      openEditorModal();
    });

    // Kategorileri Yönet butonu
    elements.manageCategoriesBtn.addEventListener('click', () => {
      openCategoryModal();
    });

    // ─── Editör Modalı Dinleyicileri ───
    elements.editorCloseBtn.addEventListener('click', () => { requestCloseEditor(); });
    elements.editorExpandBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEditorExpanded();
    });
    elements.editorCancelBtn.addEventListener('click', () => { requestCloseEditor(); });
    elements.editorForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveNote();
    });
    elements.editorSaveBtn.addEventListener('click', () => saveNote());

    // Custom select event listeners
    const triggerBtn = document.getElementById('note-edit-category-trigger');
    const selectOptions = document.getElementById('note-edit-category-options');
    const selectContainer = document.getElementById('note-edit-category-container');

    if (triggerBtn && selectOptions) {
      triggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = selectContainer.classList.contains('active');
        const modalBody = elements.editorModal.querySelector('.modal-body');
        if (isActive) {
          selectContainer.classList.remove('active');
          selectOptions.classList.add('hidden');
          if (modalBody) {
            modalBody.scrollTo({ top: 0, behavior: 'smooth' });
          }
        } else {
          selectContainer.classList.add('active');
          selectOptions.classList.remove('hidden');
          if (modalBody) {
            setTimeout(() => {
              modalBody.scrollTo({ top: modalBody.scrollHeight, behavior: 'smooth' });
            }, 80);
          }
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (selectContainer && !selectContainer.contains(e.target)) {
        if (selectContainer.classList.contains('active')) {
          selectContainer.classList.remove('active');
          if (selectOptions) selectOptions.classList.add('hidden');
          const modalBody = elements.editorModal.querySelector('.modal-body');
          if (modalBody) {
            modalBody.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      }
    });

    if (selectOptions) {
      selectOptions.addEventListener('click', (e) => {
        const opt = e.target.closest('.custom-select-option');
        if (!opt) return;
        
        const val = opt.dataset.value;
        setEditCategoryValue(val);
        
        selectContainer.classList.remove('active');
        selectOptions.classList.add('hidden');
        
        const modalBody = elements.editorModal.querySelector('.modal-body');
        if (modalBody) {
          modalBody.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
        updateCategoryPreview();
      });
    }

    elements.noteColorPicker.addEventListener('click', (e) => {
      const swatch = e.target.closest('.color-swatch');
      if (!swatch) return;

      elements.noteColorPicker.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.remove('active');
      });
      swatch.classList.add('active');
      selectedColor = swatch.dataset.color || 'charcoal';
    });

    // ─── Kategori Yöneticisi Modalı Dinleyicileri ───
    elements.categoryCloseBtn.addEventListener('click', () => closeCategoryModal());
    elements.addCategoryBtn.addEventListener('click', () => addCategory());
    elements.categoryNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addCategory();
    });

    // Kategori modalı renk seçimi
    elements.categoryColorInput.addEventListener('click', (e) => {
      const swatch = e.target.closest('.category-color-swatch');
      if (!swatch) return;

      elements.categoryColorInput.querySelectorAll('.category-color-swatch').forEach(s => {
        s.classList.remove('active');
        s.setAttribute('aria-checked', 'false');
      });
      swatch.classList.add('active');
      swatch.setAttribute('aria-checked', 'true');
    });

    // ─── Detay Modalı Dinleyicileri ───
    elements.detailCloseBtn.addEventListener('click', () => closeDetailModal());
    elements.detailCloseBottomBtn.addEventListener('click', () => closeDetailModal());
    elements.detailExpandBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDetailExpanded();
    });
    // Overlay boşluğuna (modal dışına) tıklayınca kapat — yeni not editörüne uygulanmaz
    elements.detailModal?.addEventListener('click', (e) => {
      if (e.target !== elements.detailModal) return;
      if (detailResizeState) return;
      closeDetailModal();
    });
    // Space ile aç/kapa — odak büyüt butonundayken de Space kapatır (pano önizlemesiyle aynı)
    elements.detailModal?.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Escape') return;
      if (e.target?.matches?.('input, textarea, select') || e.target?.isContentEditable) return;
      if (e.key === 'Escape') {
        // ESC global app.js'de de kapatır; burada sadece Space'i ele al
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) closeDetailModal();
    });
    // İçerik alanına odaklanabilsin (Space butonları tetiklemesin)
    if (elements.detailContent && !elements.detailContent.hasAttribute('tabindex')) {
      elements.detailContent.setAttribute('tabindex', '0');
    }
    elements.detailResizeHandle?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startDetailResize(e);
    });
    if (!detailResizeBound) {
      detailResizeBound = true;
      window.addEventListener('resize', () => {
        if (!elements.detailModal?.classList.contains('active')) return;
        if (detailCustomSize) {
          const margin = 12;
          detailCustomSize = {
            width: Math.min(detailCustomSize.width, window.innerWidth - margin * 2),
            height: Math.min(detailCustomSize.height, window.innerHeight - margin * 2),
          };
        }
        applyDetailDialogSize();
      });
      document.addEventListener('pointermove', onDetailResizeMove);
      document.addEventListener('pointerup', onDetailResizeEnd);
      document.addEventListener('pointercancel', onDetailResizeEnd);
    }
  }

  /**
   * Notları SQLite'tan yükler
   */
  async function loadNotes() {
    try {
      const params = {
        search: searchQuery,
      };

      if (activeCategoryFilter) {
        if (activeCategoryFilter === 'pinned') {
          params.pinned = true;
        } else if (activeCategoryFilter === 'favorites') {
          params.favorite = true;
        } else if (/^\d+$/.test(activeCategoryFilter)) {
          params.category_id = parseInt(activeCategoryFilter, 10);
        }
      }

      const response = await window.api.getNotes(params);
      if (response && response.success) {
        notesList = response.data;
        renderNotes();
        updateCounters();
      } else {
        console.error('Notlar yüklenemedi:', response?.error);
        Utils.showToast('Notlar yüklenemedi', 'error');
      }
    } catch (err) {
      console.error('loadNotes hatası:', err);
    }
  }

  /**
   * Kategorileri SQLite'tan yükler ve dropdown'ları günceller
   */
  async function loadCategories() {
    try {
      const response = await window.api.getCategories();
      if (response && response.success) {
        categoriesList = response.data;
        
        updateCategoryDropdowns();
        renderCategoryList();
        ensureActiveCategoryExists();
      }
    } catch (err) {
      console.error('loadCategories hatası:', err);
    }
  }

  function ensureActiveCategoryExists() {
    if (!/^\d+$/.test(activeCategoryFilter)) return;
    const exists = categoriesList.some((category) => String(category.id) === activeCategoryFilter);
    if (!exists) {
      activeCategoryFilter = '';
      updateCategoryDropdowns();
    }
  }

  function applyOpenFilter() {
    const configured = window.App?.settings?.notesOpenFilter;
    if (!configured || configured === 'preserve') return false;

    let nextFilter = '';
    if (configured === 'pinned' || configured === 'favorites') {
      nextFilter = configured;
    } else if (configured === 'uncategorized') {
      // Legacy setting — uncategorized notes no longer exist
      nextFilter = '';
    } else if (configured.startsWith('category:')) {
      const categoryId = configured.slice('category:'.length);
      if (categoriesList.some((category) => String(category.id) === categoryId)) {
        nextFilter = categoryId;
      }
    }

    if (activeCategoryFilter === nextFilter) return false;
    activeCategoryFilter = nextFilter;
    updateCategoryDropdowns();
    return true;
  }

  /**
   * Global arama sorgusunu günceller ve notları arar
   */
  function setSearch(query) {
    searchQuery = query;
    loadNotes();
  }

  /**
   * Not sayaçlarını günceller
   */
  function updateCounters() {
    elements.count.textContent = notesList.length;

    // app.js'teki global sayaç durumlarını güncelle
    if (window.App && typeof window.App.updateStatusBar === 'function') {
      window.App.updateStatusBar();
    }
  }

  /**
   * Kategori dropdown seçim elemanlarını doldurur
   */
  function updateCategoryDropdowns() {
    // 1. Filtre Sekmeleri (Paralel Sekme)
    elements.categoryFilter.innerHTML = '';
    
    const createCategoryFilterButton = (value, label, icon, color) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `filter-btn${activeCategoryFilter === value ? ' active' : ''}`;
      button.dataset.category = value;
      button.draggable = true;
      button.classList.add('filter-btn-draggable');
      button.title = window.i18n ? window.i18n.t('tooltip.dragToReorder') : 'Sürükleyerek sırala';
      button.setAttribute('aria-selected', String(activeCategoryFilter === value));
      const iconElement = document.createElement('span');
      iconElement.className = 'filter-emoji';
      iconElement.style.setProperty('--category-color', color);
      iconElement.innerHTML = icon;
      const labelElement = document.createElement('span');
      labelElement.textContent = label;
      button.append(iconElement, labelElement);
      return button;
    };

    const systemButtons = {
      all: createCategoryFilterButton(
        '',
        window.i18n ? window.i18n.t('filter.allCategories') : 'Tüm Kategoriler',
        Utils.Icons.tag,
        '#6366f1'
      ),
      pinned: createCategoryFilterButton(
        'pinned',
        window.i18n ? window.i18n.t('filter.pinned') : 'Sabitler',
        Utils.Icons.pin,
        '#2563eb'
      ),
      favorites: createCategoryFilterButton(
        'favorites',
        window.i18n ? window.i18n.t('filter.favorites') : 'Favoriler',
        Utils.Icons.star,
        '#eab308'
      ),
    };

    const systemOrder = parseNotesFilterOrder(window.App?.settings?.notesFilterOrder);
    systemOrder.forEach((key) => {
      if (systemButtons[key]) elements.categoryFilter.appendChild(systemButtons[key]);
    });

    // Separatör çizgi
    const separator = document.createElement('div');
    separator.className = 'filter-separator';
    elements.categoryFilter.appendChild(separator);

    // Kullanıcı kategorileri (sürüklenebilir)
    categoriesList.forEach((cat) => {
      const btn = createCategoryFilterButton(
        String(cat.id),
        getLocalizedCategoryName(cat.name),
        Utils.Icons[cat.icon] || Utils.Icons.folder,
        cat.color || 'var(--text-secondary)'
      );
      elements.categoryFilter.appendChild(btn);
    });

    // 2. Editor modal custom dropdown options (kategori zorunlu — boş seçenek yok)
    const optionsContainer = document.getElementById('note-edit-category-options');
    if (optionsContainer) {
      optionsContainer.innerHTML = '';

      categoriesList.forEach((cat) => {
        const opt = document.createElement('div');
        opt.className = 'custom-select-option';
        opt.dataset.value = cat.id;
        
        const rawIcon = Utils.Icons[cat.icon] || Utils.Icons.folder;
        
        opt.innerHTML = `
          <span class="selected-value-icon">${rawIcon}</span>
          <span>${Utils.escapeHtml(getLocalizedCategoryName(cat.name))}</span>
        `;
        opt.querySelector('.selected-value-icon').style.setProperty('--category-color', cat.color || 'var(--text-secondary)');
        optionsContainer.appendChild(opt);
      });
      
      // Update custom select UI value to match current state
      updateCustomCategorySelectUI(elements.editCategory.value);
    }
  }

  let draggedNoteId = null;

  /**
   * Not kartlarını çizer
   */
  function renderNotes() {
    elements.list.innerHTML = '';

    if (notesList.length === 0) {
      elements.list.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">${Utils.Icons.fileText}</span>
          <p class="empty-state-title">${window.i18n ? window.i18n.t('empty.notesTitle') : 'Not Bulunamadı'}</p>
          <p class="empty-state-text">${searchQuery ? (window.i18n ? window.i18n.t('empty.notesSearch') : 'Aramanızla eşleşen not bulunamadı.') : (window.i18n ? window.i18n.t('empty.notesText') : 'Yeni bir not eklemek için sağ üstteki "+" butonuna tıklayın.')}</p>
        </div>
      `;
      return;
    }

    let lastGroup = null;
    const fragment = document.createDocumentFragment();

    notesList.forEach((note) => {
      // Arama yoksa tarihsel gruplama yap
      if (!searchQuery) {
        const dateStr = note.updated_at || note.created_at;
        const group = Utils.getDateGroup(dateStr);
        if (group !== lastGroup) {
          lastGroup = group;
          const groupHeader = document.createElement('div');
          groupHeader.className = 'date-group-header';
          groupHeader.textContent = group;
          fragment.appendChild(groupHeader);
        }
      }

      const el = document.createElement('div');
      el.className = `note-item ${note.is_pinned ? 'pinned' : ''}`;
      el.dataset.id = note.id;
      el.setAttribute('tabindex', '0');

      // Kategori/Not renk eşleme
      const colorNameMap = {
        blue: '#2563eb',
        purple: '#8b5cf6',
        green: '#10b981',
        orange: '#f59e0b',
        red: '#ef4444',
        teal: '#06b6d4',
        charcoal: '#475569',
        anthracite: '#1e293b',
        silver: '#94a3b8',
        pink: '#ec4899',
        gray: '#94a3b8'
      };

      let noteColor = note.category_color;
      if (!noteColor) {
        const rawColor = note.color || 'charcoal';
        noteColor = rawColor.startsWith('#') ? rawColor : (colorNameMap[rawColor] || '#475569');
      }

      el.style.setProperty('--note-accent', noteColor);
      
      const hexToRgb = (hex) => {
        let c = hex.substring(1);
        if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
        const num = parseInt(c, 16);
        return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
      };
      
      try {
        el.style.setProperty('--note-glow', `rgba(${hexToRgb(noteColor)}, 0.15)`);
      } catch (e) {
        el.style.setProperty('--note-glow', 'rgba(71, 85, 105, 0.15)');
      }

      // Arama vurgulaması
      const titleText = note.title || (window.i18n ? window.i18n.t('note.untitled') : 'Başlıksız Not');
      const contentText = note.content || '';
      
      const highlightedTitle = searchQuery
        ? Utils.highlightText(titleText, searchQuery)
        : Utils.escapeHtml(titleText);

      const highlightedContent = searchQuery
        ? Utils.highlightText(Utils.truncate(contentText, 150), searchQuery)
        : Utils.escapeHtml(Utils.truncate(contentText, 150));

      const highlightedFullContent = searchQuery
        ? Utils.highlightText(contentText, searchQuery)
        : Utils.escapeHtml(contentText);

      const dateLabel = Utils.formatDate(note.updated_at || note.created_at);

      // Durum rozetleri (pin ve favorite badge)
      let badgeHTML = '';
      if (note.is_pinned || note.is_favorite) {
        badgeHTML = `<div class="note-status-badges">`;
        if (note.is_pinned) badgeHTML += `<span class="status-badge pin-badge" data-tooltip="${window.i18n ? window.i18n.t('tooltip.pinnedNote') : 'Sabitlendi'}">${Utils.Icons.pin}</span>`;
        if (note.is_favorite) badgeHTML += `<span class="status-badge fav-badge" data-tooltip="${window.i18n ? window.i18n.t('tooltip.favorited') : 'Favori'}">${Utils.Icons.star}</span>`;
        badgeHTML += `</div>`;
      }
      
      const categoryTagHTML = note.category_name
        ? `<span class="note-category-tag category-colored">${note.category_icon_svg || ''} ${Utils.escapeHtml(getLocalizedCategoryName(note.category_name))}</span>`
        : '';

      el.innerHTML = `
        <div class="note-item-header">
          <div class="note-item-title">${highlightedTitle}</div>
          <div class="note-item-actions">
            <button class="note-action-btn detail-btn eye-action-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.showDetail') : 'Detayları Göster'}" aria-label="${window.i18n ? window.i18n.t('tooltip.showDetail') : 'Detayları göster'}">${Utils.Icons.eye}</button>
            <button class="note-action-btn copy-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.copy') : 'Kopyala'}" aria-label="${window.i18n ? window.i18n.t('tooltip.copy') : 'Notu Kopyala'}">${Utils.Icons.copy}</button>
            <button class="note-action-btn edit-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.edit') : 'Düzenle'}" aria-label="${window.i18n ? window.i18n.t('tooltip.edit') : 'Notu Düzenle'}">${Utils.Icons.edit}</button>
            <button class="note-action-btn fav-btn ${note.is_favorite ? 'fav-active' : ''}" data-tooltip="${note.is_favorite ? (window.i18n ? window.i18n.t('tooltip.unfavoriteNote') : 'Favorilerden Kaldır') : (window.i18n ? window.i18n.t('tooltip.favorite') : 'Favorilere Ekle')}" aria-label="${note.is_favorite ? (window.i18n ? window.i18n.t('tooltip.unfavoriteNote') : 'Favorilerden kaldır') : (window.i18n ? window.i18n.t('tooltip.favorite') : 'Favorilere ekle')}">${Utils.Icons.star}</button>
            <button class="note-action-btn pin-btn ${note.is_pinned ? 'pin-active' : ''}" data-tooltip="${note.is_pinned ? (window.i18n ? window.i18n.t('tooltip.unpin') : 'Sabitlemeyi Kaldır') : (window.i18n ? window.i18n.t('tooltip.pin') : 'Sabitle')}" aria-label="${note.is_pinned ? (window.i18n ? window.i18n.t('tooltip.unpin') : 'Sabitlemeyi kaldır') : (window.i18n ? window.i18n.t('tooltip.pin') : 'Sabitle')}">${Utils.Icons.pin}</button>
            <button class="note-action-btn delete-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.delete') : 'Sil'}" aria-label="${window.i18n ? window.i18n.t('tooltip.delete') : 'Notu Sil'}">${Utils.Icons.trash}</button>
          </div>
        </div>
        <div class="note-item-accordion">
          <div class="note-item-accordion-content">${highlightedFullContent}</div>
        </div>
        <button type="button" class="accordion-view-more" data-tooltip="${window.i18n ? window.i18n.t('note.viewMore') : 'Devamını Gör'}" aria-label="${window.i18n ? window.i18n.t('note.viewMore') : 'Devamını Gör'}">
          <span>${window.i18n ? window.i18n.t('note.viewMore') : 'Devamını Gör'}</span>
          <svg class="icon-svg" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>
        <div class="accordion-footer-divider"></div>
        <div class="note-item-footer">
          <div class="note-footer-meta">
            ${categoryTagHTML}
            ${badgeHTML}
          </div>
          <button type="button" class="note-accordion-toggle note-accordion-open-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.expand') : 'Genişlet'}" aria-label="${window.i18n ? window.i18n.t('tooltip.expand') : 'Notu genişlet'}">
            <svg class="icon-svg discovery-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <button type="button" class="accordion-close-btn" data-tooltip="${window.i18n ? window.i18n.t('note.closeAccordion') : 'Akordiyonu Kapat'}" aria-label="${window.i18n ? window.i18n.t('note.closeAccordion') : 'Akordiyonu Kapat'}">
            <svg class="icon-svg" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"></polyline></svg>
          </button>
          <span class="note-date">${dateLabel}</span>
        </div>
      `;
      const categoryTag = el.querySelector('.category-colored');
      if (categoryTag) {
        categoryTag.style.setProperty('--category-color', note.category_color);
      }

      bindNoteEvents(el, note);
      fragment.appendChild(el);
    });

    elements.list.appendChild(fragment);
  }

  async function handleNoteReorder(draggedId, targetId) {
    if (searchQuery || activeCategoryFilter === '') {
      Utils.showToast(
        window.i18n ? window.i18n.t('toast.reorderFailed') : 'Arama veya genel görünüm etkinken sıralama değiştirilemez',
        'warning'
      );
      return;
    }

    const draggedIndex = notesList.findIndex(n => n.id === draggedId);
    const targetIndex = notesList.findIndex(n => n.id === targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Yeniden sırala
      const [draggedNote] = notesList.splice(draggedIndex, 1);
      notesList.splice(targetIndex, 0, draggedNote);

      // Yeni sort_order değerlerini ata
      const orderedIds = notesList.map((n, idx) => ({
        id: n.id,
        sort_order: idx + 1
      }));

      try {
        const response = await window.api.reorderNotes(orderedIds);
        if (response && response.success) {
          await loadNotes();
        } else {
          console.error('Yeniden sıralama hatası:', response?.error);
        }
      } catch (err) {
        console.error('handleNoteReorder hatası:', err);
      }
    }
  }

  /**
   * Not kartının draggable durumunu akordiyonun açık olup olmamasına göre günceller.
   * Akordiyon açıkken (not genişletilmişken) metin seçilebilmesi için draggable 'false' yapılır.
   */
  function updateNoteDraggableState(el) {
    const isAccordionOpen = el.classList.contains('accordion-open');
    if (isAccordionOpen) {
      el.setAttribute('draggable', 'false');
    } else {
      const isDraggable = (!searchQuery && activeCategoryFilter !== '') ? 'true' : 'false';
      el.setAttribute('draggable', isDraggable);
    }
  }

  function bindNoteEvents(el, note) {
    el.addEventListener('mouseenter', () => {
      elements.list.querySelectorAll('.note-item.hover-focused').forEach((card) => {
        if (card !== el) card.classList.remove('hover-focused');
      });
      el.classList.add('hover-focused');
      // Fare üzerindeyken kartı seç — Space ile hemen açılabilsin
      Utils.hoverSelectCard(el);
    });

    el.addEventListener('mouseleave', () => {
      el.classList.remove('hover-focused');
    });

    // Klavye navigasyonu (Ok tuşları ile odaklanma, Enter/Space)
    el.addEventListener('keydown', async (e) => {
      if (e.target !== el) return;
      if (e.key === ' ') {
        const spaceAction = window.App?.settings?.spaceKeyAction || 'copy';
        // Workspace switch is handled globally in app.js
        if (spaceAction === 'workspace') return;
        e.preventDefault();
        if (e.repeat) return;
        if (spaceAction === 'copy') {
          // Space = kopyala (pano ile tutarlı); detay için Enter / göz
          try {
            const response = await window.api.copyToClipboard(note.content, 'text', false);
            if (response && response.success) {
              Utils.copyFlashAnimation(el);
              Utils.showToast(window.i18n ? window.i18n.t('toast.noteCopied') : 'Not panoya kopyalandı!', 'success');
            }
          } catch (err) {
            console.error(err);
          }
          return;
        }
        // preview: detay aç/kapa
        if (elements.detailModal?.classList.contains('active')) {
          closeDetailModal();
        } else {
          openDetailModal(note);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        openDetailModal(note);
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const cards = [...elements.list.querySelectorAll('.note-item')];
        cards[Math.min(cards.length - 1, cards.indexOf(el) + 1)]?.focus();
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const cards = [...elements.list.querySelectorAll('.note-item')];
        cards[Math.max(0, cards.indexOf(el) - 1)]?.focus();
      }
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const cards = [...elements.list.querySelectorAll('.note-item')];
        (e.key === 'Home' ? cards[0] : cards[cards.length - 1])?.focus();
      }
      if (!e.repeat && e.key.toLowerCase() === 'c') el.querySelector('.copy-btn')?.click();
      if (!e.repeat && e.key.toLowerCase() === 'e') el.querySelector('.edit-btn')?.click();
      if (!e.repeat && e.key.toLowerCase() === 'p') el.querySelector('.pin-btn')?.click();
      if (!e.repeat && e.key.toLowerCase() === 'f') el.querySelector('.fav-btn')?.click();
      if (!e.repeat && e.key === 'Delete') el.querySelector('.delete-btn')?.click();
    });

    // Akordiyon kapatma ok butonu
    const closeBtn = el.querySelector('.accordion-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        el.classList.remove('accordion-open');
        updateNoteDraggableState(el);
      });
    }

    const openBtn = el.querySelector('.note-accordion-open-btn');
    openBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.note-item.accordion-open').forEach((item) => {
        item.classList.remove('accordion-open');
        updateNoteDraggableState(item);
      });
      el.classList.add('accordion-open');
      updateNoteDraggableState(el);
    });

    // Alt şeride tıklayınca akordiyonu kapat
    const footerEl = el.querySelector('.note-item-footer');
    if (footerEl) {
      footerEl.addEventListener('click', (e) => {
        if (el.classList.contains('accordion-open')) {
          e.stopPropagation();
          el.classList.remove('accordion-open');
          updateNoteDraggableState(el);
        }
      });
    }

    // Devamını Gör butonu → modal aç
    const viewMoreBtn = el.querySelector('.accordion-view-more');
    if (viewMoreBtn) {
      viewMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDetailModal(note);
      });
    }

    // Nota tıklayınca:
    // - Kapalıysa → akordiyon aç
    // - Açık + başlık → akordiyon kapat
    // - Açık + içerik (+ayar) → detay modalı
    el.addEventListener('click', (e) => {
      if (isDraggingGlobal) return;
      // Aksiyon ve kontrol butonları her zaman hariç
      if (e.target.closest('.note-action-btn') ||
          e.target.closest('.note-accordion-toggle') ||
          e.target.closest('.accordion-close-btn') ||
          e.target.closest('.accordion-view-more')) return;

      const isOpen = el.classList.contains('accordion-open');
      const isHeaderClick = e.target.closest('.note-item-header');
      const isContentClick = e.target.closest('.note-item-accordion');
      const s = window.App?.settings || {};
      const openModalOnContentClick = s.noteContentClickOpensModal != null && s.noteContentClickOpensModal !== ''
        ? s.noteContentClickOpensModal !== 'false'
        : s.expandedClickOpensModal !== 'false';

      if (isOpen && isHeaderClick) {
        // Başlığa tık → her zaman daralt (modal değil)
        el.classList.remove('accordion-open');
        updateNoteDraggableState(el);
        return;
      }

      if (isOpen && openModalOnContentClick && isContentClick) {
        // İçerikte metin seçiliyse modal açma — kullanıcı kopyalamak istiyor olabilir
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim()) return;
        openDetailModal(note);
        return;
      }

      // Ayar kapalıyken içerik tıklaması seçim için yoksayılır
      if (isContentClick) return;

      if (!isOpen) {
        // Akordiyon kapalıysa → aç
        document.querySelectorAll('.note-item.accordion-open').forEach(item => {
          item.classList.remove('accordion-open');
          updateNoteDraggableState(item);
        });
        el.classList.add('accordion-open');
        updateNoteDraggableState(el);
      }
    });

    // Arama veya filtre aktifse sürüklemeyi engelle (Sadece sekmelerde izin ver)
    updateNoteDraggableState(el);
    
    el.addEventListener('dragstart', (e) => {
      isDraggingGlobal = true;
      draggedNoteId = note.id;
      el.classList.add('dragging');
      elements.list.classList.add('notes-list-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', note.id.toString());
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      elements.list.classList.remove('notes-list-dragging');
      document.querySelectorAll('.note-item.drag-over').forEach(item => {
        item.classList.remove('drag-over');
      });
      setTimeout(() => {
        isDraggingGlobal = false;
      }, 100);
    });

    el.addEventListener('dragover', (e) => {
      if (draggedNoteId !== null && draggedNoteId !== note.id) {
        e.preventDefault();
        el.classList.add('drag-over');
      }
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });

    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      
      if (draggedNoteId === null || draggedNoteId === note.id) return;
      
      await handleNoteReorder(draggedNoteId, note.id);
    });

    // Başlığa çift tık → detay modalı (ayar: varsayılan kapalı; tek tık açma ile çakışmasın)
    el.addEventListener('dblclick', (e) => {
      if (window.App?.settings?.noteDoubleClickOpensModal !== 'true') return;
      if (e.target.closest('.note-action-btn') || e.target.closest('.note-item-accordion')) return;
      // Yalnızca başlık / kart gövdesi dışı akordiyon içeriği hariç
      openDetailModal(note);
    });

    // Detay/Göz butonu
    const detailBtn = el.querySelector('.detail-btn');
    if (detailBtn) {
      detailBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDetailModal(note);
      });
    }

    // Kopyala butonu
    el.querySelector('.copy-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await window.api.copyToClipboard(note.content, 'text', false);
        if (response && response.success) {
          Utils.copyFlashAnimation(el);
          Utils.showToast(window.i18n ? window.i18n.t('toast.noteCopied') : 'Not panoya kopyalandı!', 'success');
        }
      } catch (err) {
        console.error(err);
      }
    });

    // Düzenle butonu
    el.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditorModal(note);
    });

    // Favori butonu
    const favBtn = el.querySelector('.fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const response = await window.api.toggleFavoriteNote(note.id);
          if (response && response.success) {
            const isFav = response.data.is_favorite;
            Utils.showToast(isFav ? (window.i18n ? window.i18n.t('toast.noteFavAdded') : 'Favorilere eklendi') : (window.i18n ? window.i18n.t('toast.noteFavRemoved') : 'Favorilerden kaldırıldı'), 'success');
            loadNotes();
          }
        } catch (err) {
          console.error(err);
          Utils.showToast(window.i18n ? window.i18n.t('toast.noteActionFailed') : 'Favori işlemi sırasında bir hata oluştu. Lütfen uygulamanızı tepsiden tamamen kapatıp yeniden başlatın.', 'error');
        }
      });
    }

    // Sabitle butonu
    el.querySelector('.pin-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await window.api.togglePinNote(note.id);
        if (response && response.success) {
          const isPinned = response.data.is_pinned;
          Utils.showToast(isPinned ? (window.i18n ? window.i18n.t('toast.notePinned') : 'Not sabitlendi') : (window.i18n ? window.i18n.t('toast.notePinRemoved') : 'Sabitleme kaldırıldı'), 'success');
          loadNotes();
        }
      } catch (err) {
        console.error(err);
        Utils.showToast(window.i18n ? window.i18n.t('toast.notePinFailed') : 'Sabitleme işlemi sırasında bir hata oluştu. Lütfen uygulamanızı tepsiden tamamen kapatıp yeniden başlatın.', 'error');
      }
    });

    // Sil butonu
    el.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await window.App.confirm(
        window.i18n ? window.i18n.t('confirm.deleteNoteTitle') : 'Notu Sil',
        window.i18n ? window.i18n.t('confirm.deleteNoteMsg', { title: note.title || (window.i18n ? window.i18n.t('note.untitled') : 'Başlıksız Not') }) : `"${note.title || 'Başlıksız Not'}" başlıklı notu silmek istediğinize emin misiniz?`,
        Utils.Icons.trash
      );

      if (!confirmed) return;

      try {
        const response = await window.api.deleteNote(note.id);
        if (response && response.success) {
          el.style.animation = 'slideOut 0.2s ease forwards';
          el.addEventListener('animationend', () => {
            loadNotes();
          }, { once: true });
          Utils.showToast(window.i18n ? window.i18n.t('toast.noteDeleted') : 'Not silindi', 'info');
        }
      } catch (err) {
        console.error(err);
        Utils.showToast(window.i18n ? window.i18n.t('toast.noteDeleteFailed') : 'Silme işlemi sırasında bir hata oluştu.', 'error');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Not Detay Modalı Yönetimi
  // ═══════════════════════════════════════════════════════════════

  function openDetailModal(note) {
    elements.detailTitle.textContent = note.title || (window.i18n ? window.i18n.t('note.untitled') : 'Başlıksız Not');
    elements.detailContent.textContent = note.content || '';
    
    if (note.category_name) {
      elements.detailCategory.classList.remove('hidden');
      elements.detailCategory.innerHTML = `
        <span class="note-category-tag">
          ${Utils.Icons[note.category_icon] || Utils.Icons.folder} ${getLocalizedCategoryName(note.category_name)}
        </span>
      `;
    } else {
      elements.detailCategory.classList.add('hidden');
    }

    elements.detailDate.textContent = Utils.formatDate(note.updated_at || note.created_at);
    
    // Düzenle butonu
    elements.detailEditBtn.onclick = () => {
      closeDetailModal();
      openEditorModal(note);
    };

    // Kopyala butonu
    elements.detailCopyBtn.onclick = async () => {
      try {
        const response = await window.api.copyToClipboard(note.content, 'text', false);
        if (response && response.success) {
          Utils.showToast(window.i18n ? window.i18n.t('toast.noteCopied') : 'Not panoya kopyalandı!', 'success');
        }
      } catch (err) {
        console.error(err);
      }
    };

    // Her açılışta varsayılan boyuta dön (önceki oturum kalıntısı kalmasın)
    resetDetailDialogSize();
    elements.detailModal.classList.add('active');
    applyDetailDialogSize();
    Utils.initFocusTrap(elements.detailModal);
    // Büyüt butonuna değil içerik alanına odaklan — Space ile kapatma çalışsın
    setTimeout(() => {
      elements.detailContent?.focus({ preventScroll: true });
    }, 120);
  }

  function closeDetailModal() {
    onDetailResizeEnd();
    resetDetailDialogSize();
    elements.detailModal.classList.remove('active');
    Utils.destroyFocusTrap(elements.detailModal);
  }

  function getDetailExpandLabel() {
    if (window.i18n) {
      return window.i18n.t(detailExpanded ? 'preview.restore' : 'preview.expand');
    }
    return detailExpanded ? 'Varsayılan boyuta dön' : 'Büyüt';
  }

  function updateEditorExpandButton() {
    const btn = elements.editorExpandBtn;
    if (!btn) return;
    const label = window.i18n
      ? window.i18n.t(editorExpanded ? 'preview.restore' : 'preview.expand')
      : (editorExpanded ? 'Varsayılan boyuta dön' : 'Büyüt');
    btn.innerHTML = editorExpanded ? Utils.Icons.restore : Utils.Icons.maximize;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('data-tooltip', label);
    btn.setAttribute('title', label);
  }

  function toggleEditorExpanded() {
    editorExpanded = !editorExpanded;
    const dialog = elements.editorModal?.querySelector('.modal');
    dialog?.classList.toggle('is-expanded', editorExpanded);
    updateEditorExpandButton();
  }

  function resetEditorDialogSize() {
    editorExpanded = false;
    const dialog = elements.editorModal?.querySelector('.modal');
    dialog?.classList.remove('is-expanded');
    updateEditorExpandButton();
  }

  function updateDetailExpandButton() {
    const btn = elements.detailExpandBtn;
    if (!btn) return;
    const label = getDetailExpandLabel();
    btn.innerHTML = detailExpanded ? Utils.Icons.restore : Utils.Icons.maximize;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('data-tooltip', label);
    btn.setAttribute('title', label);
  }

  function toggleDetailExpanded() {
    detailExpanded = !detailExpanded;
    detailCustomSize = null;
    elements.detailDialog?.classList.toggle('is-expanded', detailExpanded);
    elements.detailDialog?.classList.remove('is-custom-size');
    updateDetailExpandButton();
    applyDetailDialogSize();
  }

  function startDetailResize(event) {
    const dialog = elements.detailDialog;
    if (!dialog || !elements.detailModal?.classList.contains('active')) return;
    const rect = dialog.getBoundingClientRect();
    detailResizeState = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    document.body.classList.add('is-resizing-detail-dialog');
  }

  function onDetailResizeMove(event) {
    if (!detailResizeState || !elements.detailDialog) return;
    const margin = 12;
    const maxWidth = Math.max(DETAIL_MIN_WIDTH, window.innerWidth - margin * 2);
    const maxHeight = Math.max(DETAIL_MIN_HEIGHT, window.innerHeight - margin * 2);
    const nextWidth = Math.min(
      maxWidth,
      Math.max(DETAIL_MIN_WIDTH, detailResizeState.startWidth + (event.clientX - detailResizeState.startX))
    );
    const nextHeight = Math.min(
      maxHeight,
      Math.max(DETAIL_MIN_HEIGHT, detailResizeState.startHeight + (event.clientY - detailResizeState.startY))
    );
    detailCustomSize = { width: nextWidth, height: nextHeight };
    detailExpanded = false;
    elements.detailDialog.classList.remove('is-expanded');
    elements.detailDialog.classList.add('is-custom-size');
    updateDetailExpandButton();
    applyDetailDialogSize();
  }

  function onDetailResizeEnd() {
    if (!detailResizeState) return;
    detailResizeState = null;
    document.body.classList.remove('is-resizing-detail-dialog');
  }

  function applyDetailDialogSize() {
    const dialog = elements.detailDialog;
    if (!dialog) return;

    const margin = detailExpanded && !detailCustomSize ? 8 : 12;
    const maxWidth = Math.max(DETAIL_MIN_WIDTH, window.innerWidth - margin * 2);
    const maxHeight = Math.max(DETAIL_MIN_HEIGHT, window.innerHeight - margin * 2);

    if (detailCustomSize) {
      const width = Math.min(maxWidth, Math.max(DETAIL_MIN_WIDTH, detailCustomSize.width));
      const height = Math.min(maxHeight, Math.max(DETAIL_MIN_HEIGHT, detailCustomSize.height));
      dialog.style.width = `${Math.round(width)}px`;
      dialog.style.maxWidth = `${Math.round(width)}px`;
      dialog.style.height = `${Math.round(height)}px`;
      dialog.style.maxHeight = `${Math.round(height)}px`;
      return;
    }

    if (detailExpanded) {
      dialog.style.width = `${maxWidth}px`;
      dialog.style.maxWidth = `${maxWidth}px`;
      dialog.style.height = `${maxHeight}px`;
      dialog.style.maxHeight = `${maxHeight}px`;
      return;
    }

    // Varsayılan: viewport ile büyüyen akışkan boyut (CSS sınıfları + inline clamp)
    dialog.style.width = '';
    dialog.style.maxWidth = '';
    dialog.style.height = '';
    dialog.style.maxHeight = `${maxHeight}px`;
  }

  function resetDetailDialogSize() {
    detailExpanded = false;
    detailCustomSize = null;
    const dialog = elements.detailDialog;
    if (dialog) {
      dialog.classList.remove('is-expanded', 'is-custom-size');
      dialog.style.width = '';
      dialog.style.maxWidth = '';
      dialog.style.height = '';
      dialog.style.maxHeight = '';
    }
    updateDetailExpandButton();
  }

  function updateCustomCategorySelectUI(val) {
    const triggerIcon = document.getElementById('note-edit-category-selected-icon');
    const triggerText = document.getElementById('note-edit-category-selected-text');
    if (!triggerIcon || !triggerText) return;

    const resolved = val || getDefaultCategoryId() || '';
    const cat = categoriesList.find((c) => String(c.id) === String(resolved));
    if (cat) {
      const rawIcon = Utils.Icons[cat.icon] || Utils.Icons.folder;
      triggerIcon.innerHTML = rawIcon;
      triggerIcon.style.setProperty('--category-color', cat.color || 'var(--text-secondary)');
      triggerText.textContent = getLocalizedCategoryName(cat.name);
    } else {
      triggerIcon.innerHTML = '';
      triggerText.textContent = window.i18n ? window.i18n.t('note.selectCategory') : 'Kategori seçin';
    }
  }

  function setEditCategoryValue(val) {
    const resolved = val || getDefaultCategoryId() || '';
    elements.editCategory.value = resolved ? String(resolved) : '';
    updateCustomCategorySelectUI(resolved);
  }

  function captureEditorBaseline() {
    editorBaseline = {
      id: elements.editId.value || '',
      title: elements.editTitle.value || '',
      content: elements.editContent.value || '',
      category: elements.editCategory.value || '',
      color: selectedColor || 'charcoal',
    };
  }

  function isEditorDirty() {
    if (!editorBaseline) return false;
    return (
      (elements.editTitle.value || '') !== editorBaseline.title
      || (elements.editContent.value || '') !== editorBaseline.content
      || (elements.editCategory.value || '') !== editorBaseline.category
      || (selectedColor || 'charcoal') !== editorBaseline.color
    );
  }

  function openEditorModal(note = null) {
    const iconSpan = elements.editorModal.querySelector('.modal-title-icon');
    const textSpan = elements.editorModal.querySelector('.modal-title-text');
    
    if (note) {
      // Düzenleme modu
      if (iconSpan) iconSpan.innerHTML = Utils.Icons.fileText;
      if (textSpan) textSpan.textContent = window.i18n ? window.i18n.t('note.editNote') : 'Notu Düzenle';
      elements.editId.value = note.id;
      elements.editTitle.value = note.title || '';
      elements.editContent.value = note.content || '';
      setEditCategoryValue(note.category_id || getDefaultCategoryId());
      selectedColor = note.color || 'charcoal';
    } else {
      // Yeni not ekleme modu
      if (iconSpan) iconSpan.innerHTML = Utils.Icons.fileText;
      if (textSpan) textSpan.textContent = window.i18n ? window.i18n.t('note.newNote') : 'Yeni Not';
      elements.editId.value = '';
      elements.editTitle.value = '';
      elements.editContent.value = '';
      // Aktif kategori filtresi (sayısal) veya varsayılan kategori
      if (activeCategoryFilter && /^\d+$/.test(activeCategoryFilter)) {
        setEditCategoryValue(activeCategoryFilter);
      } else {
        setEditCategoryValue(getDefaultCategoryId());
      }
      selectedColor = 'charcoal';
    }

    // Renk seçici swatch'larını güncelle
    elements.noteColorPicker.querySelectorAll('.color-swatch').forEach(s => {
      if (s.dataset.color === selectedColor) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });

    elements.editorModal.classList.add('active');
    resetEditorDialogSize();
    Utils.initFocusTrap(elements.editorModal);
    elements.editTitle.focus();
    updateCategoryPreview();
    captureEditorBaseline();
  }

  /**
   * Opens the note editor prefilled from a clipboard item (unsaved draft).
   */
  function openEditorFromClipboard({ title = '', content = '' } = {}) {
    openEditorModal(null);
    const iconSpan = elements.editorModal.querySelector('.modal-title-icon');
    const textSpan = elements.editorModal.querySelector('.modal-title-text');
    if (iconSpan) iconSpan.innerHTML = Utils.Icons.fileText;
    if (textSpan) {
      textSpan.textContent = window.i18n
        ? window.i18n.t('note.fromClipboard')
        : 'Panodan Not';
    }
    elements.editTitle.value = title || '';
    elements.editContent.value = content || '';
    captureEditorBaseline();
    elements.editTitle.focus();
    elements.editTitle.select();
  }

  function closeEditorModal() {
    resetEditorDialogSize();
    elements.editorModal.classList.remove('active');
    Utils.destroyFocusTrap(elements.editorModal);
    elements.editorForm.reset();
    setEditCategoryValue(getDefaultCategoryId());
    elements.categoryPreview.classList.add('hidden');
    selectedColor = 'charcoal';
    editorBaseline = null;
  }

  async function requestCloseEditor() {
    if (!elements.editorModal.classList.contains('active')) return false;
    if (isEditorDirty()) {
      const confirmed = await window.App.confirm(
        window.i18n ? window.i18n.t('confirm.discardNoteTitle') : 'Değişiklikler kaydedilmedi',
        window.i18n ? window.i18n.t('confirm.discardNoteMsg') : 'Kaydedilmemiş değişiklikler kaybolacak. Kapatmak istiyor musunuz?',
        Utils.Icons.alertTriangle
      );
      if (!confirmed) return false;
    }
    closeEditorModal();
    return true;
  }

  function updateCategoryPreview() {
    const catId = elements.editCategory.value;
    if (catId) {
      const cat = categoriesList.find(c => c.id === parseInt(catId));
      if (cat) {
        elements.categoryPreview.classList.remove('hidden');
        elements.categoryPreview.innerHTML = `
          <span class="note-category-tag category-preview-tag">
            ${Utils.Icons[cat.icon] || Utils.Icons.folder} ${getLocalizedCategoryName(cat.name)}
          </span>
        `;
      } else {
        elements.categoryPreview.classList.add('hidden');
      }
    } else {
      elements.categoryPreview.classList.add('hidden');
    }
  }

  async function saveNote() {
    const title = elements.editTitle.value.trim();
    const content = elements.editContent.value.trim();
    const categoryId = elements.editCategory.value
      ? parseInt(elements.editCategory.value, 10)
      : getDefaultCategoryId();
    const id = elements.editId.value ? parseInt(elements.editId.value) : null;

    if (!title && !content) {
      Utils.showToast(window.i18n ? window.i18n.t('toast.noteSaveFailedRequired') : 'Başlık veya içerik girmelisiniz', 'warning');
      return;
    }

    if (!categoryId) {
      Utils.showToast(
        window.i18n ? window.i18n.t('toast.noteCategoryRequired') : 'Not için bir kategori seçmelisiniz',
        'warning'
      );
      return;
    }

    try {
      // Kategori rengini bul
      let noteColor = '#475569';
      const cat = categoriesList.find((c) => c.id === categoryId);
      if (cat) noteColor = cat.color;

      const noteData = {
        title: title || (window.i18n ? window.i18n.t('note.untitled') : 'Başlıksız Not'),
        content: content,
        category_id: categoryId,
        color: noteColor,
      };

      if (id) {
        noteData.id = id;
      }

      const response = await window.api.saveNote(noteData);
      if (response && response.success) {
        Utils.showToast(id ? (window.i18n ? window.i18n.t('toast.noteUpdated') : 'Not güncellendi') : (window.i18n ? window.i18n.t('toast.noteSaved') : 'Yeni not kaydedildi'), 'success');
        closeEditorModal();
        loadNotes();
      } else {
        Utils.showToast((window.i18n ? window.i18n.t('toast.noteSaveFailed') : 'Not kaydedilemedi') + ': ' + response?.error, 'error');
      }
    } catch (err) {
      console.error('saveNote hatası:', err);
      Utils.showToast(window.i18n ? window.i18n.t('toast.noteSaveFailed') : 'Kayıt başarısız', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Kategori Yönetimi Modalı
  // ═══════════════════════════════════════════════════════════════

  function openCategoryModal() {
    elements.categoryNameInput.value = '';
    elements.categoryIconInput.value = 'folder';
    
    // Renk swatch'larını sıfırla (ilk swatch varsayılan aktif)
    elements.categoryColorInput.querySelectorAll('.category-color-swatch').forEach((s, idx) => {
      if (idx === 0) {
        s.classList.add('active');
        s.setAttribute('aria-checked', 'true');
      } else {
        s.classList.remove('active');
        s.setAttribute('aria-checked', 'false');
      }
    });

    renderCategoryList();
    elements.categoryModal.classList.add('active');
    Utils.initFocusTrap(elements.categoryModal);
    elements.categoryNameInput.focus();
  }

  function closeCategoryModal() {
    elements.categoryModal.classList.remove('active');
    Utils.destroyFocusTrap(elements.categoryModal);
  }

  /**
   * Kategori yöneticisi içindeki kategori listesini çizer
   */
  function renderCategoryList() {
    elements.categoryList.innerHTML = '';

    if (categoriesList.length === 0) {
      elements.categoryList.innerHTML = `
        <div class="empty-state category-empty-state">
          <span class="empty-state-icon category-empty-icon">${Utils.Icons.folder}</span>
          <p class="empty-state-title category-empty-title">${window.i18n ? window.i18n.t('empty.categoriesTitle') : 'Kategori Bulunmuyor'}</p>
          <p class="empty-state-text category-empty-text">${window.i18n ? window.i18n.t('empty.categoriesText') : 'Yukarıdan yeni bir kategori oluşturabilirsiniz.'}</p>
        </div>
      `;
      return;
    }

    categoriesList.forEach((cat) => {
      const row = document.createElement('div');
      row.className = 'category-manager-row';
      row.style.setProperty('--category-color', cat.color || 'var(--text-secondary)');

      row.innerHTML = `
        <div class="category-manager-identity">
          <span class="category-manager-icon">${Utils.Icons[cat.icon] || Utils.Icons.folder}</span>
          <span class="category-manager-name">${Utils.escapeHtml(getLocalizedCategoryName(cat.name))}</span>
        </div>
        <button class="btn-delete-cat" data-id="${cat.id}" type="button" aria-label="${window.i18n ? window.i18n.t('tooltip.delete') : 'Sil'}">${window.i18n ? window.i18n.t('category.deleteBtn') : '✕ Sil'}</button>
      `;

      // Kategori silme olayı
      row.querySelector('.btn-delete-cat').addEventListener('click', async (e) => {
        const id = parseInt(e.target.dataset.id);
        
        const confirmed = await window.App.confirm(
          window.i18n ? window.i18n.t('confirm.deleteCategoryTitle') : 'Kategoriyi Sil',
          window.i18n
            ? window.i18n.t('confirm.deleteCategoryMsg', { name: getLocalizedCategoryName(cat.name) })
            : `"${cat.name}" kategorisini silmek istediğinize emin misiniz? Bağlı notlar silinmez; varsayılan kategoriye taşınır.`,
          Utils.Icons.alertTriangle
        );

        if (!confirmed) return;

        try {
          const response = await window.api.deleteCategory(id);
          if (response && response.success) {
            Utils.showToast(window.i18n ? window.i18n.t('toast.categoryDeleted') : 'Kategori silindi', 'success');
            
            // Eğer silinen kategori şu an seçili filtre kategorisi ise sıfırla
            if (activeCategoryFilter === String(id)) {
              activeCategoryFilter = '';
            }

            await loadCategories();
            loadNotes(); // Notlar listesini de güncelle (kategorisi kalkmış olabilir)
          } else {
            Utils.showToast((window.i18n ? window.i18n.t('toast.categoryDeleteFailed') : 'Kategori silinemedi') + ': ' + response?.error, 'error');
          }
        } catch (err) {
          console.error(err);
        }
      });

      elements.categoryList.appendChild(row);
    });
  }

  /**
   * Yeni kategori ekler
   */
  async function addCategory() {
    const name = elements.categoryNameInput.value.trim();
    
    // Seçili swatch rengini al
    const activeSwatch = elements.categoryColorInput.querySelector('.category-color-swatch.active');
    const color = activeSwatch ? activeSwatch.dataset.color : '#6b7280';
    
    // Seçili ikonu al
    const icon = elements.categoryIconInput.value || 'folder'; 

    if (!name) {
      Utils.showToast(window.i18n ? window.i18n.t('toast.categoryNameRequired') : 'Kategori adı girmelisiniz', 'warning');
      return;
    }

    try {
      const response = await window.api.saveCategory({
        name,
        color,
        icon,
      });

      if (response && response.success) {
        Utils.showToast(window.i18n ? window.i18n.t('toast.categoryCreated') : 'Kategori oluşturuldu', 'success');
        elements.categoryNameInput.value = '';
        await loadCategories();
        // Dropdown'ları ve listeyi yenile
        loadNotes();
      } else {
        Utils.showToast((window.i18n ? window.i18n.t('toast.categoryCreateFailed') : 'Kategori oluşturulamadı') + ': ' + response?.error, 'error');
      }
    } catch (err) {
      console.error(err);
      Utils.showToast(window.i18n ? window.i18n.t('toast.categoryAddFailed') : 'Kategori eklenemedi', 'error');
    }
  }

  return {
    init,
    loadNotes,
    loadCategories,
    getLocalizedCategoryName,
    setSearch,
    openEditorFromClipboard,
    requestCloseEditor,
    closeEditorModal,
  };
})();

window.NotesPanel = NotesPanel;
