// Use global fetch (Node 18+)

async function test() {
  try {
    console.log("Fetching passport key...");
    const res = await fetch("https://search.naver.com/search.naver?where=nexearch&query=%EB%A7%9E%EC%B6%A4%EB%B2%95+%EA%B2%80%EC%82%AC%EA%B8%B0", {
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });
    const html = await res.text();
    const fs = require('fs');
    fs.writeFileSync('naver_search.html', html);
    console.log("Wrote search HTML to naver_search.html");
    console.log("Response headers from search.naver.com:");
    const cookies = [];
    res.headers.forEach((val, key) => {
      console.log(`${key}: ${val}`);
      if (key.toLowerCase() === 'set-cookie') {
        // extract name=value
        const cookie = val.split(';')[0];
        cookies.push(cookie);
      }
    });
    
    const cookieString = cookies.join('; ');
    console.log("Extracted cookies:", cookieString);

    const passportMatch = html.match(/passportKey=([^&"']+)/);
    let passportKey = null;
    if (passportMatch) {
      passportKey = passportMatch[1];
      console.log("Found passport key:", passportKey);
    } else {
      console.log("Failed to find passport key.");
      return;
    }
    
    const text = "현제 내가 적고있는 글";
    const url = `https://m.search.naver.com/p/csearch/ocontent/util/SpellerProxy?passportKey=${passportKey}&_callback=mycb&q=${encodeURIComponent(text)}&where=nexearch&color_blindness=0`;
    console.log("Calling URL:", url);
    
    const response = await fetch(url, {
      headers: {
        "Referer": "https://search.naver.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.133 Safari/537.36",
        "Cookie": cookieString,
        "Accept": "*/*"
      }
    });
    
    const responseText = await response.text();
    console.log("Response text:", responseText);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
