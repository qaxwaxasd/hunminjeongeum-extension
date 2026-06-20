async function testBarun() {
  const chunk = "현제 내가 적고있는 글";
  try {
    console.log("Calling Barun Speller API...");
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
    console.log("Barun Speller HTML response length:", html.length);
    const fs = require('fs');
    fs.writeFileSync('barun_response.html', html);
    console.log("Wrote response to barun_response.html");
    
    // Parse response
    const results = [];
    const match = html.match(/data\s*=\s*(\[\{.*?\}\]);/s);
    if (match && match[1]) {
      const dataObj = JSON.parse(match[1]);
      console.log("Parsed JSON data successfully:", dataObj);
    } else {
      console.log("No json data match. Testing fallback regex...");
      const errRegex = /<td[^>]*class=["']tdErrWord["'][^>]*>(.*?)<\/td>.*?<td[^>]*class=["']tdReplace["'][^>]*>(.*?)<\/td>.*?<td[^>]*class=["']tdHelp["'][^>]*>(.*?)<\/td>/gis;
      let errMatch;
      let matched = false;
      while ((errMatch = errRegex.exec(html)) !== null) {
        matched = true;
        const original = errMatch[1].replace(/<[^>]+>/g, '').trim();
        const suggestion = errMatch[2].replace(/<[^>]+>/g, '').trim();
        const reason = errMatch[3].replace(/<[^>]+>/g, '').trim();
        console.log(`Match: ${original} -> ${suggestion} (${reason})`);
      }
      if (!matched) {
        console.log("No errors found or regex parsing failed.");
      }
    }
  } catch (e) {
    console.error("Barun Speller error:", e);
  }
}

testBarun();
