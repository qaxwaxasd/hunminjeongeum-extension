// content.js - 훈민정음

let isExtensionEnabled = true;
let excludedDomains = [];
let debounceTimer = null;
let currentErrors = [];
let activeElement = null;
let floatingBtn = null;
let overlayPanel = null;
let isOverlayOpen = false;

// Drag state
let isDragging = false;
let isDragged = false;
let dragStartX = 0;
let dragStartY = 0;
let initialLeft = 0;
let initialTop = 0;

// ── Initialization ──

chrome.storage.local.get(['enabled', 'excludedDomains'], (result) => {
  if (result.enabled !== undefined) isExtensionEnabled = result.enabled;
  if (result.excludedDomains) excludedDomains = result.excludedDomains;

  const currentDomain = window.location.hostname;
  if (isExtensionEnabled && !excludedDomains.includes(currentDomain)) {
    initGrammarlyKR();
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.enabled) {
    isExtensionEnabled = changes.enabled.newValue;
    if (isExtensionEnabled) initGrammarlyKR();
    else disableGrammarlyKR();
  }
});

function initGrammarlyKR() {
  createFloatingButton();
  document.addEventListener('focusin', handleFocusIn, true);
  document.addEventListener('focusout', handleFocusOut, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('scroll', repositionAll, true);
  window.addEventListener('resize', repositionAll);
}

function disableGrammarlyKR() {
  document.removeEventListener('focusin', handleFocusIn, true);
  document.removeEventListener('focusout', handleFocusOut, true);
  document.removeEventListener('input', handleInput, true);
  document.removeEventListener('scroll', repositionAll, true);
  window.removeEventListener('resize', repositionAll);
  removeFloatingButton();
  closeOverlayPanel();
  removeAllHighlights();
}

// ── Helpers ──

function isEditableElement(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT' && !['password','hidden','checkbox','radio','file','submit','button','image','reset','range','color'].includes(el.type)) return true;
  if (el.isContentEditable) return true;
  return false;
}

function getTextFromElement(el) {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value || '';
  if (el.isContentEditable) return el.innerText || '';
  return '';
}

// ── Floating Button ──

function createFloatingButton() {
  if (floatingBtn) return;

  floatingBtn = document.createElement('div');
  floatingBtn.id = 'gk-floating-btn';

  const img = document.createElement('img');
  img.src = chrome.runtime.getURL('icons/icon48.png');
  img.alt = '훈민정음';
  floatingBtn.appendChild(img);

  const badge = document.createElement('span');
  badge.className = 'gk-floating-btn-badge';
  badge.style.display = 'none';
  floatingBtn.appendChild(badge);

  floatingBtn.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    
    const rect = floatingBtn.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    
    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - dragStartX;
      const dy = moveEvent.clientY - dragStartY;
      
      // Consider it a drag only if moved more than 3px
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isDragging = true;
        isDragged = true;
        floatingBtn.style.left = (initialLeft + dx + window.scrollX) + 'px';
        floatingBtn.style.top = (initialTop + dy + window.scrollY) + 'px';
        
        // Hide overlay while dragging
        if (isOverlayOpen) closeOverlayPanel();
      }
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  
  floatingBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (isDragging) return; // Prevent click action if we were dragging
    toggleOverlay();
  });

  document.body.appendChild(floatingBtn);
}

function removeFloatingButton() {
  if (floatingBtn) { floatingBtn.remove(); floatingBtn = null; }
}

function positionFloatingButton(element) {
  if (!floatingBtn || !element) return;
  
  // If manually dragged, keep it there until focus changes
  if (isDragged) {
    floatingBtn.style.display = 'flex';
    return;
  }
  
  const rect = element.getBoundingClientRect();
  const btnSize = 48; // Updated size to match CSS
  const margin = 6;

  let top = rect.bottom - btnSize - margin + window.scrollY;
  let left = rect.right - btnSize - margin + window.scrollX;

  // Keep in viewport
  if (left < 10 + window.scrollX) left = rect.left + margin + window.scrollX;
  if (top < 10 + window.scrollY) top = rect.top + margin + window.scrollY;

  floatingBtn.style.top = top + 'px';
  floatingBtn.style.left = left + 'px';
  floatingBtn.style.display = 'flex';
}

// ── Focus & Input Handling ──

function handleFocusIn(e) {
  const el = e.target;
  if (!isEditableElement(el)) return;
  if (el.type === 'password') return;

  if (activeElement !== el) {
    isDragged = false; // Reset drag state for new element
  }
  
  activeElement = el;
  positionFloatingButton(el);

  const text = getTextFromElement(el);
  if (text.trim().length > 3) {
    triggerCheck(el);
  }
}

function handleFocusOut(e) {
  setTimeout(() => {
    const focused = document.activeElement;
    if (!isEditableElement(focused) && !isOverlayOpen) {
      if (floatingBtn) floatingBtn.style.display = 'none';
      activeElement = null;
      currentErrors = [];
      updateBadge();
      removeAllHighlights();
    }
  }, 250);
}

function handleInput(e) {
  const target = e.target;
  if (!isEditableElement(target)) return;
  if (target.type === 'password') return;

  activeElement = target;
  positionFloatingButton(target);

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    triggerCheck(target);
  }, 2000);
}

function repositionAll() {
  if (activeElement && floatingBtn && floatingBtn.style.display !== 'none') {
    positionFloatingButton(activeElement);
  }
}

// ── Spelling Check ──

function triggerCheck(element) {
  const text = getTextFromElement(element);
  if (!text.trim()) {
    currentErrors = [];
    updateBadge();
    removeHighlightsFor(element);
    if (isOverlayOpen) updateOverlayContent();
    return;
  }

  chrome.runtime.sendMessage({ action: 'checkText', text: text }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[훈민정음]', chrome.runtime.lastError);
      return;
    }
    currentErrors = (response && response.results) ? response.results : [];
    updateBadge();
    applyHighlights(element, text, currentErrors);
    if (isOverlayOpen) updateOverlayContent();
  });
}

function updateBadge() {
  if (!floatingBtn) return;
  const badge = floatingBtn.querySelector('.gk-floating-btn-badge');
  if (!badge) return;

  if (currentErrors.length > 0) {
    badge.textContent = currentErrors.length;
    badge.style.display = 'flex';
    floatingBtn.classList.add('has-errors');
  } else {
    badge.style.display = 'none';
    floatingBtn.classList.remove('has-errors');
  }
}

// ── Overlay Panel (Speech Bubble) ──

function toggleOverlay() {
  if (isOverlayOpen) closeOverlayPanel();
  else showOverlayPanel();
}

function showOverlayPanel() {
  if (overlayPanel) overlayPanel.remove();

  overlayPanel = document.createElement('div');
  overlayPanel.id = 'gk-overlay-panel';
  positionOverlayPanel();
  updateOverlayContent();
  document.body.appendChild(overlayPanel);
  isOverlayOpen = true;

  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 50);
}

function positionOverlayPanel() {
  if (!overlayPanel || !floatingBtn) return;

  const btnRect = floatingBtn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const panelWidth = Math.max(Math.min(vw * 0.28, 420), 280);
  const panelHeight = Math.max(Math.min(vh * 0.35, 480), 260);

  let left = btnRect.right - panelWidth;
  let top = btnRect.top - panelHeight - 14;

  if (top < 10) {
    top = btnRect.bottom + 14;
    overlayPanel.className = 'gk-bubble-top';
  } else {
    overlayPanel.className = 'gk-bubble-bottom';
  }
  if (left < 10) left = 10;
  if (left + panelWidth > vw - 10) left = vw - panelWidth - 10;

  overlayPanel.style.position = 'fixed';
  overlayPanel.style.left = left + 'px';
  overlayPanel.style.top = top + 'px';
  overlayPanel.style.width = panelWidth + 'px';
  overlayPanel.style.maxHeight = panelHeight + 'px';
}

function updateOverlayContent() {
  if (!overlayPanel) return;

  const typeLabels = { 'typo': '오타', 'grammar': '문법', 'spacing': '띄어쓰기' };

  let html = `
    <div class="gk-panel-header">
      <div class="gk-panel-title">
        <img src="${chrome.runtime.getURL('icons/icon16.png')}" alt="">
        <span>맞춤법 검사</span>
      </div>
      <button class="gk-panel-close">&times;</button>
    </div>
    <div class="gk-panel-body">`;

  if (currentErrors.length === 0) {
    html += `
      <div class="gk-panel-empty">
        <div class="gk-panel-empty-icon">✓</div>
        <div class="gk-panel-empty-text">오류가 없습니다!</div>
        <div class="gk-panel-empty-sub">깔끔한 문장입니다.</div>
      </div>`;
  } else {
    currentErrors.forEach((error, idx) => {
      const escapedSugg = error.suggestion.replace(/"/g, '&quot;');
      html += `
        <div class="gk-suggestion-card">
          <div class="gk-suggestion-header">
            <span class="gk-suggestion-type gk-type-${error.type}">${typeLabels[error.type] || '오류'}</span>
            <span class="gk-suggestion-original">${error.original}</span>
          </div>
          <div class="gk-suggestion-content">
            <div class="gk-suggestion-text" data-idx="${idx}" title="클릭하여 적용">${error.suggestion}</div>
            <button class="gk-copy-btn" data-text="${escapedSugg}" title="복사하기">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="gk-suggestion-reason">${error.reason}</div>
        </div>`;
    });
  }

  html += `</div>`;
  overlayPanel.innerHTML = html;

  // Close button
  overlayPanel.querySelector('.gk-panel-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeOverlayPanel();
  });

  // Click suggestion to apply
  overlayPanel.querySelectorAll('.gk-suggestion-text').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      applySuggestion(parseInt(el.dataset.idx));
    });
  });

  // Copy buttons
  overlayPanel.querySelectorAll('.gk-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.text;
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('copied');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        }, 1500);
      });
    });
  });
}

function applySuggestion(index) {
  if (!activeElement || !currentErrors[index]) return;
  const error = currentErrors[index];

  if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
    activeElement.value = activeElement.value.replace(error.original, error.suggestion);
    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (activeElement.isContentEditable) {
    activeElement.innerHTML = activeElement.innerHTML.replace(error.original, error.suggestion);
    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Log correction
  chrome.runtime.sendMessage({
    action: 'logCorrection',
    correction: {
      original: error.original,
      suggestion: error.suggestion,
      type: error.type,
      timestamp: Date.now()
    }
  });

  currentErrors.splice(index, 1);
  updateBadge();
  updateOverlayContent();
}

function handleOutsideClick(e) {
  if (overlayPanel && !overlayPanel.contains(e.target) &&
      floatingBtn && !floatingBtn.contains(e.target)) {
    closeOverlayPanel();
  }
}

function closeOverlayPanel() {
  if (overlayPanel) { overlayPanel.remove(); overlayPanel = null; }
  isOverlayOpen = false;
  document.removeEventListener('click', handleOutsideClick);
}

// ── Highlight System (Red Underlines) ──

function removeAllHighlights() {
  document.querySelectorAll('.grammarly-kr-overlay-container').forEach(el => el.remove());
}

function removeHighlightsFor(element) {
  const overlayId = element.dataset.gkOverlayId;
  if (overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.remove();
    delete element.dataset.gkOverlayId;
  }
}

function applyHighlights(element, originalText, errors) {
  if (element.tagName !== 'TEXTAREA') return;
  if (errors.length === 0) { removeHighlightsFor(element); return; }

  let overlayId = element.dataset.gkOverlayId;
  let overlay;

  if (!overlayId) {
    overlayId = 'gk-hl-' + Math.random().toString(36).substr(2, 9);
    element.dataset.gkOverlayId = overlayId;

    overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'grammarly-kr-overlay-container';

    const styles = window.getComputedStyle(element);
    ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing',
     'paddingTop','paddingRight','paddingBottom','paddingLeft',
     'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
     'boxSizing','textAlign','whiteSpace','wordWrap'
    ].forEach(prop => { overlay.style[prop] = styles[prop]; });

    const rect = element.getBoundingClientRect();
    overlay.style.top = (rect.top + window.scrollY) + 'px';
    overlay.style.left = (rect.left + window.scrollX) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    element.style.backgroundColor = 'transparent';
    const z = styles.zIndex;
    if (z === 'auto' || z === '') {
      element.style.position = 'relative';
      element.style.zIndex = '2';
    }

    document.body.appendChild(overlay);

    const sync = () => {
      const r = element.getBoundingClientRect();
      overlay.style.top = (r.top + window.scrollY) + 'px';
      overlay.style.left = (r.left + window.scrollX) + 'px';
      overlay.scrollTop = element.scrollTop;
      overlay.scrollLeft = element.scrollLeft;
    };
    element.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
  } else {
    overlay = document.getElementById(overlayId);
    if (!overlay) return;
  }

  let html = originalText;
  const sorted = [...errors].sort((a, b) => b.original.length - a.original.length);

  sorted.forEach((err, i) => {
    const safe = err.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${safe})`, 'g');
    const span = `<span class="grammarly-kr-highlight-${err.type}" style="color:transparent;pointer-events:auto;" data-original="${err.original}" data-suggestion="${err.suggestion}">${err.original}</span>`;
    html = html.replace(re, span);
  });

  html = html.replace(/\n/g, '<br>');
  overlay.innerHTML = html + '&#8203;';
  overlay.scrollTop = element.scrollTop;
  overlay.scrollLeft = element.scrollLeft;
}

// ── Context Menu Results ──

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showContextMenuResult') {
    if (request.results && request.results.length > 0) {
      currentErrors = request.results;
      updateBadge();
      if (isOverlayOpen) updateOverlayContent();
      else showOverlayPanel();
    } else if (request.error) {
      showContextMenuModal(null, request.error);
    } else {
      showContextMenuModal([], null, request.text);
    }
  }
});

function showContextMenuModal(results, error, originalText) {
  let modal = document.getElementById('gk-context-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'gk-context-modal';
  modal.className = 'grammarly-kr-context-modal-overlay';

  let body = '';
  if (error) {
    body = `<div class="gk-modal-error">${error}</div>`;
  } else if (!results || results.length === 0) {
    body = `<div class="gk-modal-success">발견된 오류가 없습니다! 깔끔한 문장입니다.</div>`;
  } else {
    body = '<ul class="gk-modal-list">';
    results.forEach(r => {
      const label = r.type === 'typo' ? '오타' : r.type === 'grammar' ? '문법' : '띄어쓰기';
      body += `<li class="gk-modal-item"><div class="gk-modal-header"><span class="gk-modal-type gk-type-${r.type}">${label}</span><span class="gk-modal-original">${r.original}</span><span class="gk-modal-arrow">→</span><span class="gk-modal-suggestion">${r.suggestion}</span></div><div class="gk-modal-reason">${r.reason}</div></li>`;
    });
    body += '</ul>';
  }

  modal.innerHTML = `
    <div class="grammarly-kr-context-modal">
      <div class="gk-modal-top">
        <div style="font-weight:bold;font-size:16px;color:var(--gk-primary);">맞춤법 검사 결과</div>
        <button class="gk-modal-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:inherit;">&times;</button>
      </div>
      <div class="gk-modal-body">${body}</div>
    </div>`;

  document.body.appendChild(modal);
  modal.querySelector('.gk-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}
