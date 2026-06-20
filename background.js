// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    enabled: true,
    excludedDomains: [],
    stats: {
      typo: 0,
      grammar: 0,
      spacing: 0
    },
    isDetecting: false
  });

  chrome.contextMenus.create({
    id: "checkGrammar",
    title: "선택한 텍스트 맞춤법 검사하기",
    contexts: ["selection"]
  });
});

// ──────────────────────────────────────────────
// 상태 관리
// ──────────────────────────────────────────────

let activeChecksCount = 0;

function updateDetectingState(change) {
  activeChecksCount += change;
  if (activeChecksCount < 0) activeChecksCount = 0;
  chrome.storage.local.set({ isDetecting: activeChecksCount > 0 });
}

// ──────────────────────────────────────────────
// 네이버 맞춤법 검사 엔진
// ──────────────────────────────────────────────

let naverPassportKey = null;
let passportKeyExpiry = 0;

async function getNaverPassportKey() {
  if (naverPassportKey && Date.now() < passportKeyExpiry) {
    return naverPassportKey;
  }
  
  try {
    const res = await fetch("https://search.naver.com/search.naver?where=nexearch&query=맞춤법+검사기");
    const html = await res.text();
    const match = html.match(/passportKey=([^&"']+)/);
    if (match) {
      naverPassportKey = match[1];
      passportKeyExpiry = Date.now() + 1000 * 60 * 60; // 1시간 캐시
      return naverPassportKey;
    }
  } catch (e) {
    console.error("[훈민정음] 네이버 passportKey 획득 실패", e);
  }
  return null;
}

function unescapeHtml(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

// ──────────────────────────────────────────────
// 공용 유틸리티
// ──────────────────────────────────────────────

function splitTextToChunks(text, maxLen) {
  const chunks = [];
  let currentChunk = "";
  const sentences = text.split(/(?<=[.!?\n])\s+/);

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxLen) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      if (sentence.length > maxLen) {
        let start = 0;
        while (start < sentence.length) {
          chunks.push(sentence.substring(start, start + maxLen));
          start += maxLen;
        }
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  return chunks;
}

function deduplicateResults(allResults) {
  const unique = [];
  const seen = new Set();
  for (const r of allResults) {
    const key = r.original + "|" + r.suggestion;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }
  return unique;
}

// ──────────────────────────────────────────────
// 메인 검사 함수
// ──────────────────────────────────────────────

async function checkSpelling(text) {
  const chunks = splitTextToChunks(text, 490); // 네이버는 500자 제한
  let allResults = [];
  
  const passportKey = await getNaverPassportKey();
  if (!passportKey) {
    console.warn("[훈민정음] 네이버 인증키를 가져오지 못했습니다.");
    throw new Error("맞춤법 검사기 인증 실패");
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const url = `https://m.search.naver.com/p/csearch/ocontent/util/SpellerProxy?passportKey=${passportKey}&_callback=mycb&q=${encodeURIComponent(chunk)}&where=nexearch&color_blindness=0`;
    
    try {
      const response = await fetch(url);
      let data = await response.text();
      data = data.replace(/^mycb\(/, '').replace(/\);?$/, '');
      const json = JSON.parse(data);
      
      const origin_html = json.message.result.origin_html || "";
      const html = json.message.result.html || "";
      
      const originals = [...origin_html.matchAll(/<span class='result_underline'>(.*?)<\/span>/g)].map(m => unescapeHtml(m[1].replace(/<[^>]+>/g, '')));
      const suggestions = [...html.matchAll(/<em class='(.*?)'>(.*?)<\/em>/g)].map(m => ({
        color: m[1],
        text: unescapeHtml(m[2].replace(/<[^>]+>/g, ''))
      }));
      
      for (let j = 0; j < Math.min(originals.length, suggestions.length); j++) {
        let type = "grammar";
        if (suggestions[j].color === "red_text" || suggestions[j].color === "violet_text") type = "typo";
        else if (suggestions[j].color === "green_text") type = "spacing";
        
        allResults.push({
          original: originals[j],
          suggestion: suggestions[j].text,
          reason: "네이버 맞춤법 검사기 교정",
          type: type
        });
      }
    } catch (e) {
      console.error("[훈민정음] 네이버 API 호출 실패:", e);
    }
    
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return deduplicateResults(allResults);
}

// ──────────────────────────────────────────────
// 이벤트 리스너
// ──────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "checkGrammar" && info.selectionText) {
    updateDetectingState(1);
    try {
      const results = await checkSpelling(info.selectionText);
      chrome.tabs.sendMessage(tab.id, {
        action: 'showContextMenuResult',
        results: results,
        text: info.selectionText
      });
    } catch (error) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showContextMenuResult',
        error: error.message || "검사기 서버 통신 실패"
      });
    } finally {
      updateDetectingState(-1);
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkText') {
    updateDetectingState(1);
    checkSpelling(request.text).then((results) => {
      if (results.length > 0) {
        chrome.storage.local.get(['stats'], (data) => {
          const stats = data.stats || { typo: 0, grammar: 0, spacing: 0 };
          results.forEach(res => {
            if (stats[res.type] !== undefined) {
              stats[res.type]++;
            }
          });
          chrome.storage.local.set({ stats });
        });
      }
      sendResponse({ results });
    }).catch(err => {
      sendResponse({ error: err.message });
    }).finally(() => {
      updateDetectingState(-1);
    });
    return true; 
  }
  
  if (request.action === 'logCorrection') {
    chrome.storage.local.get(['correctionHistory'], (data) => {
      const history = data.correctionHistory || [];
      history.unshift(request.correction);
      if (history.length > 50) history.pop();
      chrome.storage.local.set({ correctionHistory: history });
    });
    return false;
  }
});
