// popup.js

document.addEventListener('DOMContentLoaded', () => {
  const toggleInput = document.getElementById('toggle-service');
  const statTypo = document.getElementById('stat-typo');
  const statGrammar = document.getElementById('stat-grammar');
  const statSpacing = document.getElementById('stat-spacing');
  const copyBtn = document.getElementById('copy-all-btn');
  const dashboardBtn = document.getElementById('open-dashboard-btn');

  // Load state
  chrome.storage.local.get(['enabled', 'stats'], (result) => {
    toggleInput.checked = result.enabled !== false;
    
    if (result.stats) {
      statTypo.textContent = result.stats.typo || 0;
      statGrammar.textContent = result.stats.grammar || 0;
      statSpacing.textContent = result.stats.spacing || 0;
    }
  });

  // Toggle listener
  toggleInput.addEventListener('change', (e) => {
    chrome.storage.local.set({ enabled: e.target.checked });
  });

  // Open Dashboard
  dashboardBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('dashboard.html'));
    }
  });

  // Copy All functionality
  // Note: For a real app, this would extract text from all input fields on the page.
  // For simplicity, we'll try to find the active element or the largest text area.
  copyBtn.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        function: () => {
          const activeEl = document.activeElement;
          let textToCopy = '';
          if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
            textToCopy = activeEl.value;
          } else if (activeEl && activeEl.isContentEditable) {
            textToCopy = activeEl.innerText;
          } else {
            // fallback to first textarea
            const ta = document.querySelector('textarea');
            if (ta) textToCopy = ta.value;
          }

          if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
              // Notification could go here
            });
            return true;
          }
          return false;
        }
      }, (results) => {
        if (results && results[0] && results[0].result) {
          const originalText = copyBtn.textContent;
          copyBtn.textContent = '복사 완료!';
          setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
        } else {
          const originalText = copyBtn.textContent;
          copyBtn.textContent = '텍스트를 찾을 수 없음';
          setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
        }
      });
    });
  });
});
