const text = "않 해. 현제 적고있는 글.";

async function testMultiple() {
  const res1 = await fetch("https://search.naver.com/search.naver?where=nexearch&query=맞춤법+검사기");
  const html1 = await res1.text();
  const passportMatch = html1.match(/passportKey=([^&"']+)/);
  if (!passportMatch) return console.log("No passport");
  const passportKey = passportMatch[1];

  const url = `https://m.search.naver.com/p/csearch/ocontent/util/SpellerProxy?passportKey=${passportKey}&_callback=mycb&q=${encodeURIComponent(text)}&where=nexearch&color_blindness=0`;
  
  const res2 = await fetch(url);
  const data = await res2.text();
  console.log(data);
}
testMultiple();
