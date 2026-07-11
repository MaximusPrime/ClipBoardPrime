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
    search: document.getElementById('clipboard-search'),
    searchClear: document.getElementById('clipboard-search-clear'),
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
    // Filtre barda fare tekerleğiyle yatay kaydırma (horizontal scroll)
    elements.filters.addEventListener('wheel', (e) => {
      e.preventDefault();
      elements.filters.scrollLeft += e.deltaY;
    });

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

    setupModalEventListeners();
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
      <div class="clip-item skeleton" style="height: 76px; margin-bottom: 4px; pointer-events: none;">
        <div class="clip-item-left">
          <div class="clip-item-icon" style="background: var(--border-primary);"></div>
        </div>
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
    if (historyItems.length === 0) {
      elements.list.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">${Utils.Icons.clipboard}</span>
          <p class="empty-state-title">${window.i18n ? window.i18n.t('empty.clipboardTitle') : 'Pano Geçmişi Boş'}</p>
          <p class="empty-state-text">${searchQuery ? (window.i18n ? window.i18n.t('empty.clipboardSearch') : 'Aramanızla eşleşen öğe bulunamadı.') : (window.i18n ? window.i18n.t('empty.clipboardText') : 'Kopyaladığınız öğeler burada görünecektir.')}</p>
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
    el.className = `clip-item ${item.is_pinned ? 'pinned' : ''} ${isLongText ? 'has-expand' : ''}`;
    el.dataset.id = item.id;
    el.dataset.type = item.content_type;
    el.setAttribute('tabindex', '0');

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

    // Durum rozetleri (pin/fav)
    let badgesHTML = '';
    if (item.is_pinned || item.is_favorite) {
      badgesHTML = `<div class="clip-status-badges">`;
      if (item.is_pinned) badgesHTML += `<span class="status-badge pin-badge" data-tooltip="${window.i18n ? window.i18n.t('tooltip.pinned') : 'Sabitlenmiş'}">${Utils.Icons.pin}</span>`;
      if (item.is_favorite) badgesHTML += `<span class="status-badge fav-badge" data-tooltip="${window.i18n ? window.i18n.t('tooltip.favorited') : 'Favori'}">${Utils.Icons.star}</span>`;
      badgesHTML += `</div>`;
    }

    // Hassas veri maske kaldır butonu
    let sensitiveBtnHTML = '';
    if (item.is_sensitive) {
      sensitiveBtnHTML = `<button class="clip-action-btn sensitive-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.showContent') : 'İçeriği Göster'}" aria-label="${window.i18n ? window.i18n.t('tooltip.showContent') : 'Hassas içeriği göster veya gizle'}">${Utils.Icons.eye}</button>`;
    }

    // Uzun metinler için genişletme butonu (chevron-down)
    let expandBtnHTML = '';
    if (isLongText) {
      const chevronDownIcon = `<svg class="icon-svg expand-icon" style="transition: transform 0.2s ease;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      expandBtnHTML = `<button class="clip-action-btn expand-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.expand') : 'Genişlet'}" aria-label="${window.i18n ? window.i18n.t('tooltip.expand') : 'Genişlet'}">${chevronDownIcon}</button>`;
    }

    el.innerHTML = `
      <div class="clip-item-left">
        <div class="clip-item-icon">
          ${Utils.getContentTypeIcon(item.content_type)}
        </div>
      </div>
      <div class="clip-item-body">
        ${contentHTML}
        ${isLongText ? `
          <div class="accordion-view-more" data-tooltip="${window.i18n ? window.i18n.t('tooltip.viewMore') : 'Devamını Gör'}" aria-label="${window.i18n ? window.i18n.t('tooltip.viewMore') : 'Devamını Gör'}">
            <span>${window.i18n ? window.i18n.t('note.viewMore') : 'Devamını Gör'}</span>
            <svg class="icon-svg" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </div>
        ` : ''}
        <div class="clip-item-meta">
          <span class="type-badge">${typeLabel}</span>
          <span class="clip-date">${dateLabel}</span>
        </div>
      </div>
      <div class="clip-item-actions">
        ${sensitiveBtnHTML}
        <button class="clip-action-btn paste-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.paste') : 'Yapıştır'}" aria-label="${window.i18n ? window.i18n.t('tooltip.paste') : 'Yapıştır'}">${Utils.Icons.paste}</button>
        <button class="clip-action-btn copy-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.copy') : 'Kopyala'}" aria-label="${window.i18n ? window.i18n.t('tooltip.copy') : 'Kopyala'}">${Utils.Icons.copy}</button>
        <button class="clip-action-btn pin-btn ${item.is_pinned ? 'pin-active' : ''}" data-tooltip="${item.is_pinned ? (window.i18n ? window.i18n.t('tooltip.unpin') : 'Sabitlemeyi Kaldır') : (window.i18n ? window.i18n.t('tooltip.pin') : 'Sabitle')}" aria-label="${item.is_pinned ? (window.i18n ? window.i18n.t('tooltip.unpin') : 'Sabitlemeyi kaldır') : (window.i18n ? window.i18n.t('tooltip.pin') : 'Sabitle')}">${Utils.Icons.pin}</button>
        <button class="clip-action-btn fav-btn ${item.is_favorite ? 'fav-active' : ''}" data-tooltip="${item.is_favorite ? (window.i18n ? window.i18n.t('tooltip.unfavorite') : 'Favorilerden Çıkar') : (window.i18n ? window.i18n.t('tooltip.favorite') : 'Favorilere Ekle')}" aria-label="${item.is_favorite ? (window.i18n ? window.i18n.t('tooltip.unfavorite') : 'Favorilerden çıkar') : (window.i18n ? window.i18n.t('tooltip.favorite') : 'Favorilere ekle')}">${Utils.Icons.star}</button>
        <button class="clip-action-btn note-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.saveAsNote') : 'Not Olarak Kaydet'}" aria-label="${window.i18n ? window.i18n.t('tooltip.saveAsNote') : 'Not olarak kaydet'}">${Utils.Icons.fileText}</button>
        <button class="clip-action-btn delete-btn" data-tooltip="${window.i18n ? window.i18n.t('tooltip.delete') : 'Sil'}" aria-label="${window.i18n ? window.i18n.t('tooltip.delete') : 'Sil'}">${Utils.Icons.trash}</button>
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
    // Klavye navigasyonu (Ok tuşları ile odaklanma, Enter ile yapıştırma, Space ile kopyalama)
    el.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (item.content_type === 'image' && item.image_path) {
          openImageViewer(item.image_path);
        } else {
          await pasteToActiveWindow(item);
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        if (item.content_type === 'image' && item.image_path) {
          openImageViewer(item.image_path);
        } else {
          await copyToSystemClipboard(item, el);
        }
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = el.nextElementSibling;
        if (next && next.classList.contains('clip-item')) {
          next.focus();
        }
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = el.previousElementSibling;
        if (prev && prev.classList.contains('clip-item')) {
          prev.focus();
        }
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

    // Sol tık: Görsel ise görüntüleyiciyi aç, metin ise akordiyonu aç/kapat veya seçilince işlem yapma
    let clickTimeout = null;
    el.addEventListener('click', (e) => {
      // Eylem butonları, metin önizleme seçimi veya devamını gör butonu tıklandıysa işlem yapma
      if (e.target.closest('.clip-action-btn') || 
          e.target.closest('.clip-item-preview') || 
          e.target.closest('.accordion-view-more')) return;

      if (item.content_type === 'image' && item.image_path) {
        openImageViewer(item.image_path);
        return;
      }

      // Çift tıklama algılaması için gecikme
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        return;
      }

      clickTimeout = setTimeout(() => {
        clickTimeout = null;

        // Metin seçiliyorsa akordiyonu tetikleme
        const selection = window.getSelection().toString();
        if (selection && selection.trim().length > 0) {
          return;
        }

        const isOpen = el.classList.contains('accordion-open');
        if (isOpen) {
          collapseCard();
        } else {
          // Diğer açık akordiyonları kapat
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
          const icon = el.querySelector('.expand-icon');
          if (icon) icon.style.transform = 'rotate(180deg)';
          const expBtn = el.querySelector('.expand-btn');
          if (expBtn) expBtn.setAttribute('data-tooltip', window.i18n ? window.i18n.t('tooltip.collapse') : 'Daralt');
        }
      }, 200);
    });

    // Çift tıklama: Görseller hariç öğeyi doğrudan aktif pencereye yapıştırır
    el.addEventListener('dblclick', async (e) => {
      if (e.target.closest('.clip-action-btn') || e.target.closest('.clip-item-preview')) return;
      if (item.content_type === 'image') return;
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

    // Devamını Gör butonu -> detay modalını aç
    const viewMoreBtn = el.querySelector('.accordion-view-more');
    if (viewMoreBtn) {
      viewMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openClipDetailModal(item);
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
            sensitiveBtn.innerHTML = Utils.Icons.eye;
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
          Utils.showToast(updatedItem.is_pinned ? (window.i18n ? window.i18n.t('toast.itemPinned') : 'Öğe sabitlendi') : (window.i18n ? window.i18n.t('toast.itemPinRemoved') : 'Sabitleme kaldırıldı'), 'success');
          
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
          
          Utils.showToast(updatedItem.is_favorite ? (window.i18n ? window.i18n.t('toast.itemFavAdded') : 'Favorilere eklendi') : (window.i18n ? window.i18n.t('toast.itemFavRemoved') : 'Favorilerden çıkarıldı'), 'success');
          
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
    const noteBtn = el.querySelector('.note-btn');
    if (noteBtn) noteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await window.api.clipToNote(item.id);
        if (response && response.success) {
          Utils.showToast(window.i18n ? window.i18n.t('toast.clipToNoteSaved') : 'Pano öğesi not olarak kaydedildi', 'success');
          
          // Notlar panelini yenile
          if (window.NotesPanel && typeof window.NotesPanel.loadNotes === 'function') {
            window.NotesPanel.loadNotes();
          }
        } else {
          Utils.showToast((window.i18n ? window.i18n.t('toast.clipToNoteFailed') : 'Nota aktarılamadı') + ': ' + response?.error, 'error');
        }
      } catch (err) {
        console.error('Not aktarma hatası:', err);
      }
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
            updateCounters(historyItems.length);
          }, { once: true });
          Utils.showToast(window.i18n ? window.i18n.t('toast.itemDeleted') : 'Öğe silindi', 'info');
          // Yetim görselleri asenkron temizle
          window.api.cleanupOrphanImages().catch(err => console.error(err));
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
      let response;
      if (item.is_sensitive) {
        response = await window.api.copyToClipboard({ id: item.id, ignoreChange: false });
      } else {
        let contentToCopy = item.content;
        let copyType = item.content_type;
        if (copyType === 'image') {
          contentToCopy = item.image_path;
        }
        response = await window.api.copyToClipboard(contentToCopy, copyType, false);
      }
      
      if (response && response.success) {
        Utils.showToast(window.i18n ? window.i18n.t('toast.copied') : 'Panoya kopyalandı!', 'success');
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
    try {
      if (item.content_type === 'image') {
        Utils.showToast(window.i18n ? window.i18n.t('toast.pasteImageInfo') : 'Görseller doğrudan yapıştırılamaz. Panoya kopyalanıyor...', 'info');
        await copyToSystemClipboard(item);
        return;
      }

      let response;
      if (item.is_sensitive) {
        response = await window.api.pasteToActiveWindow({ id: item.id });
      } else {
        response = await window.api.pasteToActiveWindow(item.content);
      }

      if (!response || !response.success) {
        Utils.showToast((window.i18n ? window.i18n.t('toast.pasteFailed') : 'Yapıştırma başarısız') + ': ' + response?.error, 'error');
      }
    } catch (err) {
      console.error('pasteToActiveWindow hatası:', err);
      Utils.showToast(window.i18n ? window.i18n.t('toast.pasteFailed') : 'Yapıştırma başarısız', 'error');
    }
  }

  /**
   * Main process'ten yeni bir veri geldiğinde listeye ekler
   */
  function handleNewItem(item) {
    // Eğer kopyalanan öğe mevcut listenin en başındakiyle aynıysa yenileme yapma
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

      // Ekranda listenin başına kusursuz şekilde gelmesi için scroll'u en üst seviyeye akıcı şekilde kaydırıyoruz.
      const isAlreadyAtTop = elements.list.scrollTop === 0;

      const triggerFlash = () => {
        const newEl = elements.list.querySelector(`.clip-item[data-id="${item.id}"]`);
        if (newEl) {
          Utils.copyFlashAnimation(newEl);
        }
      };

      if (isAlreadyAtTop) {
        triggerFlash();
      } else {
        let safetyTimeoutId = null;

        // Kaydırma (scroll) animasyonu tamamlandığında en üstteki öğeyi flaşlatmak için dinleyiciler ekliyoruz.
        const handleScrollEnd = () => {
          if (elements.list.scrollTop === 0) {
            cleanup();
            triggerFlash();
          }
        };

        const handleScroll = () => {
          if (elements.list.scrollTop === 0) {
            cleanup();
            triggerFlash();
          }
        };

        const cleanup = () => {
          elements.list.removeEventListener('scroll', handleScroll);
          elements.list.removeEventListener('scrollend', handleScrollEnd);
          if (safetyTimeoutId) {
            clearTimeout(safetyTimeoutId);
            safetyTimeoutId = null;
          }
        };

        elements.list.addEventListener('scroll', handleScroll);
        elements.list.addEventListener('scrollend', handleScrollEnd);

        // Akıcı yukarı kaydırma başlat
        elements.list.scrollTo({ top: 0, behavior: 'smooth' });

        // Güvenlik önlemi: Eğer beklenmedik şekilde scroll 0'a tam oturmazsa, 800ms sonra zorla flaşlat ve temizle.
        safetyTimeoutId = setTimeout(() => {
          cleanup();
          const newEl = elements.list.querySelector(`.clip-item[data-id="${item.id}"]`);
          if (newEl && !newEl.classList.contains('copy-flash')) {
            triggerFlash();
          }
        }, 800);
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
      modal.className = 'modal-overlay';
      modal.style.zIndex = '3000'; // En üstte göster
      modal.innerHTML = `
        <div class="modal" style="width: auto; max-width: 85vw; background: transparent; border: none; box-shadow: none; display: flex; align-items: center; justify-content: center;">
          <div style="position: relative; display: inline-block;">
            <button id="image-viewer-close-btn" style="position: absolute; right: 12px; top: 12px; background: rgba(0, 0, 0, 0.7); color: #fff; border-radius: 50%; width: 32px; height: 32px; font-size: 16px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.25); cursor: pointer; z-index: 10; font-weight: bold; transition: all 0.2s ease;">✕</button>
            <img id="image-viewer-img" style="max-width: 100%; max-height: 85vh; border-radius: var(--radius-md); box-shadow: var(--shadow-xl); display: block; border: 1px solid var(--border-primary);" src="" alt="Görsel">
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeBtn = modal.querySelector('#image-viewer-close-btn');
      if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });

      // ESC ile kapatma desteği (bir kere ekle, kapatıldığında kaldır)
      const escHandler = (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
          modal.classList.remove('active');
          window.removeEventListener('keydown', escHandler);
        }
      };
      window.addEventListener('keydown', escHandler);
    }

    const img = modal.querySelector('#image-viewer-img');
    const fileUrl = 'local-file:///' + imagePath.replace(/\\/g, '/');
    img.src = fileUrl;
    modal.classList.add('active');
  }

  // ═══════════════════════════════════════════════════════════════
  // Pano Detay ve Editör Modalleri Yönetimi
  // ═══════════════════════════════════════════════════════════════

  function setupModalEventListeners() {
    const detailCloseBtn = document.getElementById('clip-detail-close-btn');
    const detailCloseBottomBtn = document.getElementById('clip-detail-close-bottom-btn');
    const editorCloseBtn = document.getElementById('clip-editor-close-btn');
    const editorCancelBtn = document.getElementById('clip-editor-cancel-btn');
    const editorForm = document.getElementById('clip-editor-form');
    const editorSaveBtn = document.getElementById('clip-editor-save-btn');

    if (detailCloseBtn) detailCloseBtn.addEventListener('click', () => closeClipDetailModal());
    if (detailCloseBottomBtn) detailCloseBottomBtn.addEventListener('click', () => closeClipDetailModal());
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

