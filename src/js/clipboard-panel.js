/* ═══════════════════════════════════════════════════════════════
   ClipBoard Pro — Clipboard Panel Module
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const ClipboardPanel = (() => {
  const elements = {
    list: document.getElementById('clipboard-list'),
    count: document.getElementById('clipboard-count'),
    filters: document.getElementById('clipboard-filters'),
    clearBtn: document.getElementById('clear-history-btn'),
  };

  let historyItems = [];
  let activeFilter = 'all';
  let searchQuery = '';
  let currentPage = 1;
  let hasMore = true;
  let isLoading = false;
  const limit = 50;

  /**
   * Modülü başlatır ve olay dinleyicilerini tanımlar
   */
  function init() {
    setupEventListeners();
    loadHistory(false);
  }

  /**
   * Olay dinleyicilerini kurar
   */
  function setupEventListeners() {
    // Filtre butonları
    elements.filters.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;

      // Aktif sınıfını güncelle
      elements.filters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;
      handleFilterChange(filter);
    });

    // Sonsuz kaydırma (Infinite Scroll)
    elements.list.addEventListener('scroll', () => {
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

    // IPC Olayı: Main process'ten yeni clipboard öğesi bildirimi
    window.api.onClipboardChanged((item) => {
      handleNewItem(item);
    });
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
        Utils.showToast('Pano geçmişi yüklenemedi', 'error');
      }
    } catch (err) {
      console.error('loadHistory hatası:', err);
      Utils.showToast('Bir hata oluştu', 'error');
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
    elements.count.textContent = total;
    
    // app.js'teki global durum güncellemesini tetikle
    if (window.App && typeof window.App.updateStatusBar === 'function') {
      window.App.updateStatusBar();
    }
  }

  /**
   * Skeleton yükleme efekti gösterir
   */
  function showSkeleton() {
    elements.list.innerHTML = Array(5).fill(0).map(() => `
      <div class="clip-item skeleton" style="height: 70px; margin-bottom: 4px; pointer-events: none;">
        <div class="clip-item-icon" style="background: var(--border-primary);"></div>
        <div class="clip-item-body" style="gap: 8px;">
          <div style="width: 70%; height: 14px; background: var(--border-primary); border-radius: var(--radius-sm);"></div>
          <div style="width: 40%; height: 10px; background: var(--border-primary); border-radius: var(--radius-sm);"></div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Pano geçmişini DOM'a çizer
   */
  function renderHistory(append = false, keepScroll = false, savedScroll = 0) {
    if (!append) {
      elements.list.innerHTML = '';
    } else {
      // Önceki skeleton veya yükleniyor göstergelerini temizle
      const skeletons = elements.list.querySelectorAll('.skeleton');
      skeletons.forEach(s => s.remove());
    }

    if (historyItems.length === 0) {
      elements.list.innerHTML = `
        <div class="panel-empty-state">
          <span class="empty-state-icon">${Utils.Icons.clipboard}</span>
          <p class="empty-state-title">Pano Geçmişi Boş</p>
          <p class="empty-state-desc">${searchQuery ? 'Aramanızla eşleşen öğe bulunamadı.' : 'Kopyaladığınız öğeler burada görünecektir.'}</p>
        </div>
      `;
      return;
    }

    let lastGroup = null;
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

    elements.list.appendChild(fragment);

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
    el.className = `clip-item ${item.is_pinned ? 'pinned' : ''}`;
    el.dataset.id = item.id;
    el.dataset.type = item.content_type;

    // İçerik önizleme veya görsel önizleme
    let contentHTML = '';
    if (item.content_type === 'image' && item.image_path) {
      // Windows dosya yollarını dosya URL'ine çevir
      const fileUrl = 'file:///' + item.image_path.replace(/\\/g, '/');
      contentHTML = `
        <img class="clip-item-image-preview" src="${fileUrl}" alt="Görsel Pano" onerror="this.src='./assets/image-error.png';">
      `;
    } else {
      // Arama yapılmışsa eşleşen kısımları vurgula
      let previewText = item.content || '';
      if (item.content_type === 'html') {
        previewText = previewText.replace(/<[^>]*>/g, '');
      }

      
      // Hassas veri ise gizle
      if (item.is_sensitive) {
        previewText = '•••••••••••• (Hassas Veri)';
        el.classList.add('sensitive');
      }

      const highlighted = searchQuery && !item.is_sensitive
        ? Utils.highlightText(previewText, searchQuery)
        : Utils.escapeHtml(previewText);

      contentHTML = `<div class="clip-item-preview">${highlighted}</div>`;
    }

    const typeLabel = Utils.getContentTypeLabel(item.content_type);
    const dateLabel = Utils.timeAgo(item.created_at);

    // Durum rozetleri (pin/fav)
    let badgesHTML = '';
    if (item.is_pinned || item.is_favorite) {
      badgesHTML = `<div class="clip-status-badges">`;
      if (item.is_pinned) badgesHTML += `<span class="status-badge pin-badge" data-tooltip="Sabitlenmiş">${Utils.Icons.pin}</span>`;
      if (item.is_favorite) badgesHTML += `<span class="status-badge fav-badge" data-tooltip="Favori">${Utils.Icons.star}</span>`;
      badgesHTML += `</div>`;
    }

    // Genişletme (göz) butonu sadece gerçekten uzun metin ve kodlar için gösterilmeli
    let expandBtnHTML = '';
    if (item.content_type !== 'image' && item.content_type !== 'url') {
      const textVal = item.content || '';
      const newlineCount = (textVal.match(/\n/g) || []).length;
      if (textVal.length > 200 || newlineCount >= 3) {
        expandBtnHTML = `<button class="clip-action-btn expand-btn" data-tooltip="Genişlet/Daralt">${Utils.Icons.eye}</button>`;
      }
    }

    el.innerHTML = `
      <div class="clip-item-icon">${Utils.getContentTypeIcon(item.content_type)}</div>
      <div class="clip-item-body">
        ${contentHTML}
        <div class="clip-item-meta">
          <span class="type-badge">${typeLabel}</span>
          <span class="clip-date">${dateLabel}</span>
        </div>
      </div>
      ${badgesHTML}
      <div class="clip-item-actions">
        ${expandBtnHTML}
        <button class="clip-action-btn copy-btn" data-tooltip="Kopyala">${Utils.Icons.copy}</button>
        <button class="clip-action-btn pin-btn ${item.is_pinned ? 'pin-active' : ''}" data-tooltip="${item.is_pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}">${Utils.Icons.pin}</button>
        <button class="clip-action-btn fav-btn ${item.is_favorite ? 'fav-active' : ''}" data-tooltip="${item.is_favorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}">${Utils.Icons.star}</button>
        <button class="clip-action-btn note-btn" data-tooltip="Not Olarak Kaydet">${Utils.Icons.fileText}</button>
        <button class="clip-action-btn delete-btn" data-tooltip="Sil">${Utils.Icons.trash}</button>
      </div>
    `;


    bindItemEvents(el, item);
    return el;
  }

  /**
   * Pano öğesi üzerindeki olayları bağlar
   */
  function bindItemEvents(el, item) {
    // Sol tık: Panoya kopyala
    el.addEventListener('click', async (e) => {
      // Eğer tıklama aksiyon butonlarından birine yapıldıysa kopyalama yapma
      if (e.target.closest('.clip-action-btn')) return;

      await copyToSystemClipboard(item, el);
    });

    // Çift tık: Aktif pencereye yapıştır
    el.addEventListener('dblclick', async (e) => {
      if (e.target.closest('.clip-action-btn')) return;
      
      // Hassas veri ise gerçek içeriği al
      const pasteContent = item.content;
      if (item.content_type !== 'image' && pasteContent) {
        Utils.copyFlashAnimation(el);
        const response = await window.api.pasteToActiveWindow(pasteContent);
        if (response && response.success) {
          // Pencere zaten kapandı, kullanıcı yapıştırdı.
        } else {
          Utils.showToast('Yapıştırılamadı: ' + response?.error, 'error');
        }
      } else {
        // Görseller için normal kopyalama yap
        await copyToSystemClipboard(item, el);
      }
    });

    // Genişlet/Daralt butonu
    const expandBtn = el.querySelector('.expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        el.classList.toggle('expanded');
        if (el.classList.contains('expanded')) {
          expandBtn.innerHTML = Utils.Icons.eyeOff;
          expandBtn.setAttribute('data-tooltip', 'Daralt');
        } else {
          expandBtn.innerHTML = Utils.Icons.eye;
          expandBtn.setAttribute('data-tooltip', 'Genişlet');
        }
      });
    }


    // Kopyala butonu
    el.querySelector('.copy-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyToSystemClipboard(item, el);
    });

    // Pin butonu
    el.querySelector('.pin-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await window.api.togglePinClipboard(item.id);
        if (response && response.success) {
          const updatedItem = response.data;
          Utils.showToast(updatedItem.is_pinned ? 'Öğe sabitlendi' : 'Sabitleme kaldırıldı', 'success');
          
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
              updateCounters(historyItems.length - 1);
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
    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await window.api.toggleFavoriteClipboard(item.id);
        if (response && response.success) {
          const updatedItem = response.data;
          favBtn.classList.toggle('fav-active', updatedItem.is_favorite);
          favBtn.setAttribute('data-tooltip', updatedItem.is_favorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle');
          
          if (updatedItem.is_favorite) {
            favBtn.classList.add('fav-animate');
            favBtn.addEventListener('animationend', () => favBtn.classList.remove('fav-animate'), { once: true });
          }
          
          Utils.showToast(updatedItem.is_favorite ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı', 'success');
          
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
              updateCounters(historyItems.length - 1);
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

    // Not yapma butonu (clip-to-note)
    el.querySelector('.note-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await window.api.clipToNote(item.id);
        if (response && response.success) {
          Utils.showToast('Pano öğesi not olarak kaydedildi', 'success');
          
          // Notlar panelini yenile
          if (window.NotesPanel && typeof window.NotesPanel.loadNotes === 'function') {
            window.NotesPanel.loadNotes();
          }
        } else {
          Utils.showToast('Nota aktarılamadı: ' + response?.error, 'error');
        }
      } catch (err) {
        console.error('Not aktarma hatası:', err);
      }
    });

    // Sil butonu
    el.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      
      let preview = item.content || '';
      if (item.content_type === 'image') {
        preview = 'Görsel Öğesi';
      } else {
        preview = Utils.truncate(preview, 50);
      }
      
      const confirmed = await window.App.confirm(
        'Öğeyi Sil',
        `"${preview}" içeriğine sahip pano geçmişi öğesini silmek istediğinize emin misiniz?`,
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
            updateCounters(historyItems.length);
          }, { once: true });
          Utils.showToast('Öğe silindi', 'info');
        }
      } catch (err) {
        console.error('Silme hatası:', err);
      }
    });
  }

  /**
   * Öğeyi sistem panosuna kopyalar
   */
  async function copyToSystemClipboard(item, element) {
    try {
      let contentToCopy = item.content;
      let copyType = item.content_type;

      if (copyType === 'image') {
        contentToCopy = item.image_path;
      }

      const response = await window.api.copyToClipboard(contentToCopy, copyType, false);
      if (response && response.success) {
        Utils.copyFlashAnimation(element);
        Utils.showToast('Panoya kopyalandı!', 'success');
      } else {
        Utils.showToast('Kopyalanamadı: ' + response?.error, 'error');
      }
    } catch (err) {
      console.error('copyToSystemClipboard hatası:', err);
      Utils.showToast('Kopyalama başarısız', 'error');
    }
  }

  /**
   * Main process'ten yeni bir veri geldiğinde listeye ekler
   */
  function handleNewItem(item) {
    // Eğer kopyalanan öğe mevcut listenin en başındakiyle aynıysa yenileme (bunu main process engelliyor ama garantiye alalım)
    if (historyItems.length > 0 && historyItems[0].content === item.content && historyItems[0].content_type === item.content_type) {
      return;
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

      // Sadece created_at DESC ile sırala (sabitler üste çıkmayacak)
      historyItems.sort((a, b) => {
        return b.created_at.localeCompare(a.created_at);
      });

      renderHistory(false);
      // Otomatik en üste kay (Madde 5)
      elements.list.scrollTop = 0;
    } else {
      // Eşleşmese bile arka planda total sayaçlarını güncellemek için listeyi yenile
      loadHistory(false);
    }
  }

  /**
   * Pano geçmişini temizler
   */
  async function handleClearHistory() {
    // app.js'teki global confirm modalını kullan veya yerel oluştur
    const confirmed = await window.App.confirm(
      'Geçmişi Temizle',
      'Sabitlenmemiş tüm pano geçmişini silmek istediğinize emin misiniz? Sabitlenmiş öğeler korunacaktır.',
      Utils.Icons.trash
    );

    if (!confirmed) return;

    try {
      const response = await window.api.clearClipboardHistory();
      if (response && response.success) {
        Utils.showToast(`${response.data.deleted} öğe temizlendi.`, 'success');
        loadHistory(false);
      } else {
        Utils.showToast('Temizlenemedi: ' + response?.error, 'error');
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

    // 2. Rozetleri (badges) güncelle
    const existingBadges = el.querySelector('.clip-status-badges');
    if (existingBadges) {
      existingBadges.remove();
    }

    if (updatedItem.is_pinned || updatedItem.is_favorite) {
      let badgesHTML = `<div class="clip-status-badges">`;
      if (updatedItem.is_pinned) badgesHTML += `<span class="status-badge pin-badge" data-tooltip="Sabitlenmiş">${Utils.Icons.pin}</span>`;
      if (updatedItem.is_favorite) badgesHTML += `<span class="status-badge fav-badge" data-tooltip="Favori">${Utils.Icons.star}</span>`;
      badgesHTML += `</div>`;

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = badgesHTML;
      const newBadgesEl = tempDiv.firstChild;
      const actionsDiv = el.querySelector('.clip-item-actions');
      el.insertBefore(newBadgesEl, actionsDiv);
    }

    // 3. Pin butonunu güncelle
    const pinBtn = el.querySelector('.pin-btn');
    if (pinBtn) {
      if (updatedItem.is_pinned) {
        pinBtn.classList.add('pin-active');
        pinBtn.setAttribute('data-tooltip', 'Sabitlemeyi Kaldır');
      } else {
        pinBtn.classList.remove('pin-active');
        pinBtn.setAttribute('data-tooltip', 'Sabitle');
      }
    }

    // 4. Favori butonunu güncelle
    const favBtn = el.querySelector('.fav-btn');
    if (favBtn) {
      if (updatedItem.is_favorite) {
        favBtn.classList.add('fav-active');
        favBtn.setAttribute('data-tooltip', 'Favorilerden Çıkar');
      } else {
        favBtn.classList.remove('fav-active');
        favBtn.setAttribute('data-tooltip', 'Favorilere Ekle');
      }
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

