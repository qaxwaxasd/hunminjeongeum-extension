async function test() {
  const q = encodeURIComponent("아무렇게나 글을 입력 했을때");
  
  // Try Naver mobile
  const urlNaver = `https://m.search.naver.com/p/csearch/ocontent/util/SpellerProxy?_callback=mycb&q=${q}&where=nexearch&color_blindness=0`;
  const res1 = await fetch(urlNaver, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  console.log("Naver Mobile:", await res1.text());

  // Try Nara Speller
  const res2 = await fetch("https://nara-speller.co.kr/old_speller/results", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0"
    },
    body: new URLSearchParams({ text1: "아무렇게나 글을 입력 했을때" }).toString()
  });
  const text2 = await res2.text();
  console.log("Nara Speller length:", text2.length);
}
test().catch(console.error);
