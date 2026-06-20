document.addEventListener('DOMContentLoaded', () => {
  // Navigation
  const navLinks = document.querySelectorAll('.nav a');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      navLinks.forEach(l => l.parentElement.classList.remove('active'));
      e.target.parentElement.classList.add('active');
    });
  });

  // Load Data
  chrome.storage.local.get(['stats', 'excludedDomains', 'correctionHistory', 'geminiApiKey'], (result) => {
    const stats = result.stats || { typo: 0, grammar: 0, spacing: 0 };
    const domains = result.excludedDomains || [];
    const history = result.correctionHistory || [];

    // Render Stats
    document.getElementById('total-typo').textContent = stats.typo;
    document.getElementById('total-grammar').textContent = stats.grammar;
    document.getElementById('total-spacing').textContent = stats.spacing;

    renderChart(stats);
    renderDomains(domains);
    renderHistory(history);

    // 엔진 상태 표시 제거됨 (항상 Naver 사용)
  });

  // API 키 관리는 네이버 API 전환으로 삭제됨

  // Domain Management
  const domainInput = document.getElementById('domain-input');
  const addDomainBtn = document.getElementById('add-domain-btn');

  addDomainBtn.addEventListener('click', () => {
    const domain = domainInput.value.trim().toLowerCase();
    if (domain) {
      chrome.storage.local.get(['excludedDomains'], (result) => {
        const domains = result.excludedDomains || [];
        if (!domains.includes(domain)) {
          domains.push(domain);
          chrome.storage.local.set({ excludedDomains: domains }, () => {
            renderDomains(domains);
            domainInput.value = '';
          });
        }
      });
    }
  });
});



function renderDomains(domains) {
  const list = document.getElementById('domain-list');
  list.innerHTML = '';
  
  if (domains.length === 0) {
    list.innerHTML = '<li class="domain-item" style="color: var(--text-muted);">등록된 제외 도메인이 없습니다.</li>';
    return;
  }

  domains.forEach(domain => {
    const li = document.createElement('li');
    li.className = 'domain-item';
    li.innerHTML = `
      <span>${domain}</span>
      <button class="remove-btn" data-domain="${domain}">삭제</button>
    `;
    list.appendChild(li);
  });

  // Add delete listeners
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const domainToRemove = e.target.getAttribute('data-domain');
      chrome.storage.local.get(['excludedDomains'], (result) => {
        const domains = result.excludedDomains || [];
        const newDomains = domains.filter(d => d !== domainToRemove);
        chrome.storage.local.set({ excludedDomains: newDomains }, () => {
          renderDomains(newDomains);
        });
      });
    });
  });
}

function renderChart(stats) {
  const ctx = document.getElementById('statsChart').getContext('2d');
  
  // Custom colors using CSS variables for dark/light mode support
  const rootStyle = getComputedStyle(document.documentElement);
  const colorTypo = rootStyle.getPropertyValue('--error-typo').trim() || '#FF4D4F';
  const colorGrammar = rootStyle.getPropertyValue('--error-grammar').trim() || '#1890FF';
  const colorSpacing = rootStyle.getPropertyValue('--error-spacing').trim() || '#52C41A';
  const colorCorrected = rootStyle.getPropertyValue('--primary').trim() || '#52C41A';
  const textColor = rootStyle.getPropertyValue('--text-muted').trim() || '#6B7280';
  const gridColor = rootStyle.getPropertyValue('--border-color').trim() || '#E5E7EB';

  const totalCorrections = stats.typo + stats.grammar + stats.spacing;

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['교정 완료', '오타', '문법', '띄어쓰기'],
      datasets: [{
        label: '건수',
        data: [totalCorrections, stats.typo, stats.grammar, stats.spacing],
        backgroundColor: [colorCorrected, colorTypo, colorGrammar, colorSpacing],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor,
            stepSize: 1
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: textColor,
            font: { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }
          }
        }
      }
    }
  });
}

function renderHistory(history) {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  
  if (history.length === 0) {
    list.innerHTML = '<li class="domain-item" style="color: var(--text-muted); padding: 12px 16px;">교정 내역이 없습니다.</li>';
    return;
  }

  const typeLabels = {
    'typo': '오타',
    'grammar': '문법',
    'spacing': '띄어쓰기'
  };

  history.forEach(item => {
    const li = document.createElement('li');
    li.className = 'domain-item history-item'; // Reuse domain-item for border and padding
    
    const date = new Date(item.timestamp);
    const timeString = `${date.getMonth()+1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    
    li.innerHTML = `
      <div class="history-type ${item.type}">${typeLabels[item.type]}</div>
      <div class="history-text">
        <span class="history-original">${item.original}</span>
        <span class="history-arrow">→</span>
        <span class="history-suggestion">${item.suggestion}</span>
      </div>
      <div class="history-time">${timeString}</div>
    `;
    list.appendChild(li);
  });
}
