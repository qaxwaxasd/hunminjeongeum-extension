// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    enabled: true,
    excludedDomains: [],
    stats: {
      typo: 0,
      grammar: 0,
      spacing: 0
    }
  });

  chrome.contextMenus.create({
    id: "checkGrammar",
    title: "선택한 텍스트 맞춤법 검사하기",
    contexts: ["selection"]
  });
});

// ──────────────────────────────────────────────
// 네이버 맞춤법 검사기 (주요 엔진)
// ──────────────────────────────────────────────

let cachedPassportKey = null;
let passportKeyRetries = 0;

async function fetchNaverPassportKey() {
  try {
    console.log("[훈민정음] passportKey 가져오기 시도...");
    const res = await fetch("https://search.naver.com/search.naver?where=nexearch&query=%EB%A7%9E%EC%B6%A4%EB%B2%95+%EA%B2%80%EC%82%AC%EA%B8%B0", {
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });
    const html = await res.text();
    console.log("[훈민정음] 네이버 페이지 수신 길이:", html.length);

    // passportKey는 URL 쿼리 파라미터 형태로 포함: passportKey=hex값
    // 예: SpellerProxy?passportKey=c08115ccec28b25c2795b45818fc07d1e92ce1fc
    const match = html.match(/passportKey=([a-f0-9]{20,})/i);
    if (match && match[1]) {
      cachedPassportKey = match[1];
      console.log("[훈민정음] passportKey 추출 성공:", cachedPassportKey.substring(0, 8) + "...");
      return cachedPassportKey;
    }

    // 다른 패턴도 시도
    const match2 = html.match(/["']passportKey["']\s*:\s*["']([a-f0-9]{20,})["']/i);
    if (match2 && match2[1]) {
      cachedPassportKey = match2[1];
      console.log("[훈민정음] passportKey 추출 성공 (패턴2):", cachedPassportKey.substring(0, 8) + "...");
      return cachedPassportKey;
    }

    console.warn("[훈민정음] passportKey를 찾지 못함. 페이지 앞부분:", html.substring(0, 500));
    return null;
  } catch (e) {
    console.error("[훈민정음] PassportKey 가져오기 실패:", e);
    return null;
  }
}

async function checkNaverSpeller(text) {
  // passportKey가 없으면 먼저 가져오기 (최대 2회 재시도)
  if (!cachedPassportKey) {
    await fetchNaverPassportKey();
    if (!cachedPassportKey) {
      // 한 번 더 시도
      await new Promise(r => setTimeout(r, 500));
      await fetchNaverPassportKey();
    }
  }

  if (!cachedPassportKey) {
    console.warn("[훈민정음] passportKey 없이 API 호출 시도 (실패할 수 있음)");
  }

  const chunks = splitTextToChunks(text, 500);
  let allResults = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      // passportKey가 있으면 URL에 포함, 없으면 없이 시도
      let url;
      if (cachedPassportKey) {
        url = `https://ts-proxy.naver.com/ocontent/util/SpellerProxy?passportKey=${cachedPassportKey}&_callback=cb&q=${encodeURIComponent(chunk)}`;
      } else {
        url = `https://ts-proxy.naver.com/ocontent/util/SpellerProxy?_callback=cb&q=${encodeURIComponent(chunk)}`;
      }

      console.log("[훈민정음] API 호출:", url.substring(0, 120) + "...");
      const response = await fetch(url, {
        headers: {
          "Referer": "https://search.naver.com/",
          "Accept": "*/*"
        }
      });

      console.log("[훈민정음] API 응답 상태:", response.status);
      const responseText = await response.text();
      console.log("[훈민정음] API 응답 길이:", responseText.length, "앞부분:", responseText.substring(0, 200));

      // JSONP 응답에서 JSON 추출
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn("[훈민정음] JSON 추출 실패, passportKey 재시도");
        cachedPassportKey = null;
        await fetchNaverPassportKey();
        continue;
      }

      const data = JSON.parse(jsonMatch[0]);
      if (data.message && data.message.result) {
        const result = data.message.result;
        const parsed = parseNaverResult(result);
        allResults = allResults.concat(parsed);
        console.log("[훈민정음] 파싱 결과:", parsed.length, "건");
      }
    } catch (e) {
      console.error("[훈민정음] 네이버 맞춤법 검사 실패:", e);
      // passportKey 문제일 수 있으므로 초기화
      if (passportKeyRetries < 2) {
        cachedPassportKey = null;
        passportKeyRetries++;
        await fetchNaverPassportKey();
      }
    }

    // Rate Limit Delay
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  return deduplicateResults(allResults);
}

function parseNaverResult(result) {
  const results = [];

  if (result.errata_count === 0) return results;

  // 네이버는 HTML 태그로 교정 결과를 반환
  const notag_html = result.notag_html || "";
  const html = result.html || "";
  const original = result.origin_html || result.orgStr || "";

  // errInfo 배열이 있으면 활용
  if (result.errInfo && Array.isArray(result.errInfo)) {
    result.errInfo.forEach(err => {
      let type = 'grammar';
      if (err.errType === 1 || (err.help && err.help.includes('맞춤법'))) type = 'typo';
      else if (err.errType === 2 || (err.help && err.help.includes('띄어쓰기'))) type = 'spacing';

      results.push({
        original: err.orgStr || '',
        suggestion: err.candWord ? err.candWord.split('|').filter(Boolean).join(', ') : '',
        reason: (err.help || '').replace(/<[^>]+>/g, ''),
        type: type
      });
    });
    return results;
  }

  // HTML diff 기반 파싱 (errInfo 없는 경우)
  // <span class='result_underline green/red/purple'>원본</span> → 수정본 패턴
  const spanRegex = /<span\s+class=['"](?:result_underline\s+)?(\w+)['"][^>]*>(.*?)<\/span>/gi;
  let match;

  while ((match = spanRegex.exec(html)) !== null) {
    const colorClass = match[1].toLowerCase();
    const word = match[2].replace(/<[^>]+>/g, '').trim();

    let type = 'grammar';
    if (colorClass === 'green' || colorClass.includes('green')) type = 'spacing';
    else if (colorClass === 'red' || colorClass.includes('red')) type = 'typo';
    else if (colorClass === 'purple' || colorClass.includes('purple')) type = 'grammar';

    // notag_html에서 해당 위치의 수정본 추출 시도
    if (word) {
      results.push({
        original: word,
        suggestion: word, // 최소한 원본 반환
        reason: type === 'typo' ? '맞춤법 오류' : type === 'spacing' ? '띄어쓰기 오류' : '문법 오류',
        type: type
      });
    }
  }

  return results;
}

// ──────────────────────────────────────────────
// 바른한글 (구 부산대 맞춤법 검사기) - Fallback
// ──────────────────────────────────────────────

async function checkBarunSpeller(text) {
  const chunks = splitTextToChunks(text, 300);
  let allResults = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      // 신규 도메인: nara-speller.co.kr
      const response = await fetch("https://nara-speller.co.kr/old_speller/results", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://nara-speller.co.kr/old_speller/",
          "Origin": "https://nara-speller.co.kr"
        },
        body: new URLSearchParams({ text1: chunk }).toString()
      });
      const html = await response.text();
      const parsed = parseBarunResponse(html);
      allResults = allResults.concat(parsed);
    } catch (e) {
      console.error("바른한글 검사 실패:", e);
    }

    // Rate Limit Delay: 1 second
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return deduplicateResults(allResults);
}

function parseBarunResponse(html) {
  const results = [];
  try {
    const match = html.match(/data\s*=\s*(\[\{.*?\}\]);/s);
    if (match && match[1]) {
      const dataObj = JSON.parse(match[1]);
      dataObj.forEach(page => {
        if (page.errInfo) {
          page.errInfo.forEach(err => {
            let type = 'grammar';
            if (err.help && err.help.includes('띄어쓰기')) type = 'spacing';
            else if (err.help && (err.help.includes('철자') || err.help.includes('오탈자'))) type = 'typo';

            const suggestions = err.candWord.split('|').filter(Boolean).join(', ');

            results.push({
              original: err.orgStr,
              suggestion: suggestions || err.orgStr,
              reason: (err.help || '').replace(/<[^>]+>/g, ''),
              type: type
            });
          });
        }
      });
      return results;
    }

    // Fallback Regex Parsing
    const errRegex = /<td[^>]*class=["']tdErrWord["'][^>]*>(.*?)<\/td>.*?<td[^>]*class=["']tdReplace["'][^>]*>(.*?)<\/td>.*?<td[^>]*class=["']tdHelp["'][^>]*>(.*?)<\/td>/gis;
    let errMatch;
    let matched = false;
    while ((errMatch = errRegex.exec(html)) !== null) {
      matched = true;
      const original = errMatch[1].replace(/<[^>]+>/g, '').trim();
      const suggestion = errMatch[2].replace(/<[^>]+>/g, '').trim();
      const reason = errMatch[3].replace(/<[^>]+>/g, '').trim();

      let type = 'grammar';
      if (reason.includes('띄어쓰기')) type = 'spacing';
      else if (reason.includes('오탈자') || reason.includes('철자')) type = 'typo';

      results.push({
        original,
        suggestion,
        reason,
        type
      });
    }

    if (!matched && html.includes('문법 및 철자 오류가 발견되지')) {
      return []; // No errors
    }

  } catch (e) {
    console.error("바른한글 파싱 에러:", e);
  }
  return results;
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
// 메인 검사 함수 (Fallback 체인)
// ──────────────────────────────────────────────

async function checkSpelling(text) {
  // 1순위: 네이버 맞춤법 검사기 (가장 안정적)
  try {
    console.log("[훈민정음] 네이버 맞춤법 검사기 시도...");
    const results = await checkNaverSpeller(text);
    // 네이버 API 호출이 성공하면 0건이어도 그대로 반환 (오류 없는 정상 문장)
    console.log("[훈민정음] 네이버 검사 완료:", results.length, "건");
    return results;
  } catch (e) {
    console.warn("[훈민정음] 네이버 검사 실패, 바른한글로 전환:", e.message);
  }

  // 2순위: 바른한글 (구 부산대 맞춤법 검사기) — 네이버가 완전히 실패한 경우에만
  try {
    console.log("[훈민정음] 바른한글 맞춤법 검사기 시도...");
    const results = await checkBarunSpeller(text);
    console.log("[훈민정음] 바른한글 검사 완료:", results.length, "건");
    return results;
  } catch (e) {
    console.warn("[훈민정음] 바른한글 검사도 실패:", e.message);
  }

  // 모든 엔진 실패 시 빈 배열 반환 (에러를 throw하지 않음)
  console.error("[훈민정음] 모든 맞춤법 검사 엔진 실패");
  return [];
}

// ──────────────────────────────────────────────
// 이벤트 리스너
// ──────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "checkGrammar" && info.selectionText) {
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
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkText') {
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
