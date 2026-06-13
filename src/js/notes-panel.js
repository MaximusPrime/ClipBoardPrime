/* ═══════════════════════════════════════════════════════════════
   ClipBoard Pro — Notes Panel Module
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const NotesPanel = (() => {
  const elements = {
    list: document.getElementById('notes-list'),
    count: document.getElementById('notes-count'),
    categoryFilter: document.getElementById('notes-category-filter'),
    manageCategoriesBtn: document.getElementById('manage-categories-btn'),
    newNoteBtn: document.getElementById('new-note-btn'),
    
    // Editor Modal
    editorModal: document.getElementById('note-editor-modal'),
    editorCloseBtn: document.getElementById('note-editor-close-btn'),
    editorCancelBtn: document.getElementById('note-editor-cancel-btn'),
    editorSaveBtn: document.getElementById('note-editor-save-btn'),
    editorForm: document.getElementById('note-editor-form'),
    editId: document.getElementById('note-edit-id'),
    editTitle: document.getElementById('note-edit-title'),
    editContent: document.getElementById('note-edit-content'),
    editCategory: document.getElementById('note-edit-category'),
    categoryPreview: document.getElementById('note-edit-category-preview'),
    modalTitle: document.getElementById('note-editor-title'),
    
    // Category Manager Modal
    categoryModal: document.getElementById('category-manager-modal'),
    categoryCloseBtn: document.getElementById('category-manager-close-btn'),
    categoryNameInput: document.getElementById('new-category-name'),
    categoryColorInput: document.getElementById('new-category-color'),
    addCategoryBtn: document.getElementById('add-category-btn'),
    categoryList: document.getElementById('category-list'),

    // Detail Modal
    detailModal: document.getElementById('note-detail-modal'),
    detailCloseBtn: document.getElementById('note-detail-close-btn'),
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
  let selectedColor = 'gray';

  /**
   * Modülü başlatır ve olay dinleyicilerini tanımlar
   */
  function init() {
    setupEventListeners();
    loadCategories();
    loadNotes();
  }

  /**
   * Olay dinleyicilerini kurar
   */
  function setupEventListeners() {
    // Kategori filtre seçimi
    elements.categoryFilter.addEventListener('change', (e) => {
      activeCategoryFilter = e.target.value;
      loadNotes();
    });

    // Yeni Not butonu
    elements.newNoteBtn.addEventListener('click', () => {
      openEditorModal();
    });

    // Kategorileri Yönet butonu
    elements.manageCategoriesBtn.addEventListener('click', () => {
      openCategoryModal();
    });

    // ─── Editör Modalı Dinleyicileri ───
    elements.editorCloseBtn.addEventListener('click', () => closeEditorModal());
    elements.editorCancelBtn.addEventListener('click', () => closeEditorModal());
    elements.editorForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveNote();
    });
    elements.editorSaveBtn.addEventListener('click', () => saveNote());

    elements.editCategory.addEventListener('change', () => {
      updateCategoryPreview();
    });

    // ─── Kategori Yöneticisi Modalı Dinleyicileri ───
    elements.categoryCloseBtn.addEventListener('click', () => closeCategoryModal());
    elements.addCategoryBtn.addEventListener('click', () => addCategory());
    elements.categoryNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addCategory();
    });

    // ─── Detay Modalı Dinleyicileri ───
    elements.detailCloseBtn.addEventListener('click', () => closeDetailModal());

    // ─── Boşluğa tıklayarak kapatma ───
    elements.editorModal.addEventListener('click', (e) => {
      if (e.target === elements.editorModal) closeEditorModal();
    });
    
    elements.detailModal.addEventListener('click', (e) => {
      if (e.target === elements.detailModal) closeDetailModal();
    });

    elements.categoryModal.addEventListener('click', (e) => {
      if (e.target === elements.categoryModal) closeCategoryModal();
    });
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
        params.category_id = parseInt(activeCategoryFilter);
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
      }
    } catch (err) {
      console.error('loadCategories hatası:', err);
    }
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
    // 1. Filtre dropdown
    const filterVal = elements.categoryFilter.value;
    elements.categoryFilter.innerHTML = '<option value="">🏷️ Tüm Kategoriler</option>';
    categoriesList.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = `🏷️ ${cat.name}`;
      elements.categoryFilter.appendChild(opt);
    });
    elements.categoryFilter.value = filterVal; // Seçimi koru

    // 2. Editor modal dropdown
    elements.editCategory.innerHTML = '';
    categoriesList.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = `🏷️ ${cat.name}`;
      elements.editCategory.appendChild(opt);
    });
  }

  let draggedNoteId = null;

  /**
   * Not kartlarını çizer
   */
  function renderNotes() {
    elements.list.innerHTML = '';

    if (notesList.length === 0) {
      elements.list.innerHTML = `
        <div class="panel-empty-state">
          <span class="empty-state-icon">${Utils.Icons.fileText}</span>
          <p class="empty-state-title">Not Bulunamadı</p>
          <p class="empty-state-desc">${searchQuery ? 'Aramanızla eşleşen not bulunamadı.' : 'Yeni bir not eklemek için sağ üstteki "+" butonuna tıklayın.'}</p>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    notesList.forEach((note) => {
      const el = document.createElement('div');
      el.className = `note-item ${note.is_pinned ? 'pinned' : ''}`;
      el.dataset.id = note.id;
      el.dataset.color = note.color || 'blue';

      // Arama vurgulaması
      const titleText = note.title || 'Başlıksız Not';
      const contentText = note.content || '';
      
      const highlightedTitle = searchQuery
        ? Utils.highlightText(titleText, searchQuery)
        : Utils.escapeHtml(titleText);

      const highlightedContent = searchQuery
        ? Utils.highlightText(Utils.truncate(contentText, 150), searchQuery)
        : Utils.escapeHtml(Utils.truncate(contentText, 150));

      const dateLabel = Utils.formatDate(note.updated_at || note.created_at);

      // Durum rozetleri (pin badge) - Madde 11
      let badgeHTML = '';
      if (note.is_pinned) {
        badgeHTML = `
          <div class="note-status-badges">
            <div class="status-badge pin-badge" data-tooltip="Sabitlendi">
              ${Utils.Icons.pin}
            </div>
          </div>
        `;
      }

      el.innerHTML = `
        <div class="note-item-header">
          <div class="note-item-title">${highlightedTitle}</div>
          <div class="note-item-actions">
            <button class="note-action-btn copy-btn" data-tooltip="Kopyala">${Utils.Icons.copy}</button>
            <button class="note-action-btn edit-btn" data-tooltip="Düzenle">${Utils.Icons.edit}</button>
            <button class="note-action-btn pin-btn ${note.is_pinned ? 'pin-active' : ''}" data-tooltip="${note.is_pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}">${Utils.Icons.pin}</button>
            <button class="note-action-btn delete-btn" data-tooltip="Sil">${Utils.Icons.trash}</button>
          </div>
        </div>
        <div class="note-item-content">${highlightedContent.replace(/\n/g, '<br>')}</div>
        <div class="note-item-accordion">
          <div class="note-item-accordion-content">${Utils.escapeHtml(contentText)}</div>
        </div>
        <div class="note-item-footer">
          <div style="display: flex; align-items: center; gap: 8px;">
            ${note.category_name ? `<span class="note-category-tag">${Utils.Icons[note.category_icon] || Utils.Icons.folder} ${note.category_name}</span>` : '<span></span>'}
            ${badgeHTML}
          </div>
          <span class="note-date">${dateLabel}</span>
        </div>
      `;

      bindNoteEvents(el, note);
      fragment.appendChild(el);
    });

    elements.list.appendChild(fragment);
  }

  async function handleNoteReorder(draggedId, targetId, isPinned) {
    const groupNotes = notesList.filter(n => n.is_pinned === isPinned);
    const draggedIndex = groupNotes.findIndex(n => n.id === draggedId);
    const targetIndex = groupNotes.findIndex(n => n.id === targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Yeniden sırala
      const [draggedNote] = groupNotes.splice(draggedIndex, 1);
      groupNotes.splice(targetIndex, 0, draggedNote);

      // Yeni sort_order değerlerini ata
      const orderedIds = groupNotes.map((n, idx) => ({
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

  function bindNoteEvents(el, note) {
    // Nota tıklayınca akordiyonu aç/kapat (Madde 4)
    el.addEventListener('click', (e) => {
      if (e.target.closest('.note-action-btn') || e.target.closest('.note-item-accordion')) return;
      
      const isOpen = el.classList.contains('accordion-open');
      if (isOpen) {
        el.classList.remove('accordion-open');
      } else {
        // İsteğe bağlı: diğer tüm açık akordiyonları kapat
        document.querySelectorAll('.note-item.accordion-open').forEach(item => {
          item.classList.remove('accordion-open');
        });
        el.classList.add('accordion-open');
      }
    });

    // Tüm notlar için sürükle-bırak (Madde 2 - genişletilmiş)
    el.setAttribute('draggable', 'true');
    
    el.addEventListener('dragstart', (e) => {
      console.log('Drag başlatıldı - Not ID:', note.id, 'Pinned:', note.is_pinned);
      draggedNoteId = note.id;
      el.classList.add('dragging');
      elements.list.classList.add('notes-list-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', note.id.toString());
    });

    el.addEventListener('dragend', () => {
      console.log('Drag bitti - Not ID:', note.id);
      el.classList.remove('dragging');
      elements.list.classList.remove('notes-list-dragging');
      document.querySelectorAll('.note-item.drag-over').forEach(item => {
        item.classList.remove('drag-over');
      });
    });

    el.addEventListener('dragover', (e) => {
      if (draggedNoteId !== null && draggedNoteId !== note.id) {
        const draggedNote = notesList.find(n => n.id === draggedNoteId);
        // Sadece aynı sabitleme durumundaki (her ikisi de pinned veya her ikisi de unpinned) öğelerin üzerine bırakılabilir
        if (draggedNote && draggedNote.is_pinned === note.is_pinned) {
          e.preventDefault();
          el.classList.add('drag-over');
        }
      }
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });

    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      console.log('Bırakıldı (Drop) - Kaynak ID:', draggedNoteId, 'Hedef ID:', note.id);
      if (draggedNoteId !== null && draggedNoteId !== note.id) {
        const draggedNote = notesList.find(n => n.id === draggedNoteId);
        if (draggedNote && draggedNote.is_pinned === note.is_pinned) {
          await handleNoteReorder(draggedNoteId, note.id, note.is_pinned);
        }
      }
    });

    // Kopyala butonu
    el.querySelector('.copy-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await window.api.copyToClipboard(note.content, 'text', false);
        if (response && response.success) {
          Utils.copyFlashAnimation(el);
          Utils.showToast('Not panoya kopyalandı!', 'success');
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

    // Sabitle butonu
    el.querySelector('.pin-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const updatedNote = {
          id: note.id,
          title: note.title,
          content: note.content,
          category_id: note.category_id,
          color: note.color,
          is_pinned: note.is_pinned ? 0 : 1,
        };
        const response = await window.api.saveNote(updatedNote);
        if (response && response.success) {
          Utils.showToast(updatedNote.is_pinned ? 'Not sabitlendi' : 'Sabitleme kaldırıldı', 'success');
          loadNotes();
        }
      } catch (err) {
        console.error(err);
      }
    });

    // Sil butonu
    el.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await window.App.confirm(
        'Notu Sil',
        `"${note.title || 'Başlıksız Not'}" başlıklı notu silmek istediğinize emin misiniz?`,
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
          Utils.showToast('Not silindi', 'info');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Not Detay Modalı Yönetimi
  // ═══════════════════════════════════════════════════════════════

  function openDetailModal(note) {
    elements.detailTitle.textContent = note.title || 'Başlıksız Not';
    elements.detailContent.textContent = note.content || '';
    
    if (note.category_name) {
      elements.detailCategory.style.display = 'block';
      elements.detailCategory.innerHTML = `
        <span class="note-category-tag">
          ${Utils.Icons[note.category_icon] || Utils.Icons.folder} ${note.category_name}
        </span>
      `;
    } else {
      elements.detailCategory.style.display = 'none';
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
          Utils.showToast('Not panoya kopyalandı!', 'success');
        }
      } catch (err) {
        console.error(err);
      }
    };

    elements.detailModal.classList.add('active');
  }

  function closeDetailModal() {
    elements.detailModal.classList.remove('active');
  }

  // ═══════════════════════════════════════════════════════════════
  // Not Editör Modalı Yönetimi
  // ═══════════════════════════════════════════════════════════════

  function openEditorModal(note = null) {
    const iconSpan = elements.editorModal.querySelector('.modal-title-icon');
    const textSpan = elements.editorModal.querySelector('.modal-title-text');
    
    if (note) {
      // Düzenleme modu
      if (iconSpan) iconSpan.innerHTML = Utils.Icons.fileText;
      if (textSpan) textSpan.textContent = 'Notu Düzenle';
      elements.editId.value = note.id;
      elements.editTitle.value = note.title || '';
      elements.editContent.value = note.content || '';
      elements.editCategory.value = note.category_id || '';
      selectedColor = 'gray';
    } else {
      // Yeni not ekleme modu
      if (iconSpan) iconSpan.innerHTML = Utils.Icons.fileText;
      if (textSpan) textSpan.textContent = 'Yeni Not';
      elements.editId.value = '';
      elements.editTitle.value = '';
      elements.editContent.value = '';
      // Varsayılan olarak Genel kategorisini seç (kategorisiz seçeneği kalktı)
      const genelCat = categoriesList.find(c => c.name === 'Genel');
      const defaultCatId = genelCat ? genelCat.id : (categoriesList.length > 0 ? categoriesList[0].id : '');
      elements.editCategory.value = activeCategoryFilter || defaultCatId;
      selectedColor = 'gray';
    }

    elements.editorModal.classList.add('active');
    elements.editTitle.focus();
    updateCategoryPreview();
  }

  function closeEditorModal() {
    elements.editorModal.classList.remove('active');
    elements.editorForm.reset();
    elements.categoryPreview.style.display = 'none';
  }

  function updateCategoryPreview() {
    const catId = elements.editCategory.value;
    if (catId) {
      const cat = categoriesList.find(c => c.id === parseInt(catId));
      if (cat) {
        elements.categoryPreview.style.display = 'block';
        elements.categoryPreview.innerHTML = `
          <span class="note-category-tag" style="font-size: 11px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px; border-radius: var(--radius-full); margin-top: 4px;">
            ${Utils.Icons[cat.icon] || Utils.Icons.folder} ${cat.name}
          </span>
        `;
      } else {
        elements.categoryPreview.style.display = 'none';
      }
    } else {
      elements.categoryPreview.style.display = 'none';
    }
  }

  async function saveNote() {
    const title = elements.editTitle.value.trim();
    const content = elements.editContent.value.trim();
    const categoryId = elements.editCategory.value ? parseInt(elements.editCategory.value) : null;
    const id = elements.editId.value ? parseInt(elements.editId.value) : null;

    if (!title && !content) {
      Utils.showToast('Başlık veya içerik girmelisiniz', 'warning');
      return;
    }

    try {
      const noteData = {
        title: title || 'Başlıksız Not',
        content: content,
        category_id: categoryId,
        color: selectedColor,
      };

      if (id) {
        noteData.id = id;
      }

      const response = await window.api.saveNote(noteData);
      if (response && response.success) {
        Utils.showToast(id ? 'Not güncellendi' : 'Yeni not kaydedildi', 'success');
        closeEditorModal();
        loadNotes();
      } else {
        Utils.showToast('Not kaydedilemedi: ' + response?.error, 'error');
      }
    } catch (err) {
      console.error('saveNote hatası:', err);
      Utils.showToast('Kayıt başarısız', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Kategori Yönetimi Modalı
  // ═══════════════════════════════════════════════════════════════

  function openCategoryModal() {
    elements.categoryNameInput.value = '';
    if (elements.categoryColorInput) {
      elements.categoryColorInput.value = '#6b7280';
    }
    renderCategoryList();
    elements.categoryModal.classList.add('active');
    elements.categoryNameInput.focus();
  }

  function closeCategoryModal() {
    elements.categoryModal.classList.remove('active');
  }

  /**
   * Kategori yöneticisi içindeki kategori listesini çizer
   */
  function renderCategoryList() {
    elements.categoryList.innerHTML = '';

    if (categoriesList.length === 0) {
      elements.categoryList.innerHTML = '<p style="text-align:center;padding:12px;color:var(--text-muted);">Henüz kategori oluşturmadınız.</p>';
      return;
    }

    categoriesList.forEach((cat) => {
      const row = document.createElement('div');
      row.className = 'category-manager-row';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '8px 12px';
      row.style.marginBottom = '4px';
      row.style.borderRadius = 'var(--radius-sm)';
      row.style.background = 'var(--bg-input)';
      row.style.border = '1px solid var(--border-primary)';

      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;display:flex;align-items:center;color:var(--text-secondary)">${Utils.Icons[cat.icon] || Utils.Icons.folder}</span>
          <span style="font-weight:500;color:var(--text-primary)">${Utils.escapeHtml(cat.name)}</span>
        </div>
        <button class="btn-delete-cat" data-id="${cat.id}" style="color:var(--text-muted);cursor:pointer;font-size:11px;transition:color var(--transition-fast);padding:4px 8px;">✕ Sil</button>
      `;

      // Kategori silme olayı
      row.querySelector('.btn-delete-cat').addEventListener('click', async (e) => {
        const id = parseInt(e.target.dataset.id);
        
        const confirmed = await window.App.confirm(
          'Kategoriyi Sil',
          `"${cat.name}" kategorisini silmek istediğinize emin misiniz? Bu kategoriye bağlı notlar silinmez, "Kategorisiz" olarak güncellenir.`,
          Utils.Icons.alertTriangle
        );

        if (!confirmed) return;

        try {
          const response = await window.api.deleteCategory(id);
          if (response && response.success) {
            Utils.showToast('Kategori silindi', 'success');
            await loadCategories();
            loadNotes(); // Notlar listesini de güncelle (kategorisi kalkmış olabilir)
          } else {
            Utils.showToast('Kategori silinemedi: ' + response?.error, 'error');
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
    const color = '#6b7280'; 
    
    // Varsayılan klasör simgesi
    const icon = 'folder'; 

    if (!name) {
      Utils.showToast('Kategori adı girmelisiniz', 'warning');
      return;
    }

    try {
      const response = await window.api.saveCategory({
        name,
        color,
        icon,
      });

      if (response && response.success) {
        Utils.showToast('Kategori oluşturuldu', 'success');
        elements.categoryNameInput.value = '';
        await loadCategories();
      } else {
        Utils.showToast('Kategori oluşturulamadı: ' + response?.error, 'error');
      }
    } catch (err) {
      console.error(err);
      Utils.showToast('Kategori eklenemedi', 'error');
    }
  }

  return {
    init,
    loadNotes,
    loadCategories,
    setSearch,
  };
})();

window.NotesPanel = NotesPanel;

