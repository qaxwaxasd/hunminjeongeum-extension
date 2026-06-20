async function testDaum() {
  const text = "안녕하새요. 만나서 반갑습니당. 현제 내가 적고있는 글.";
  const url = "https://dic.daum.net/grammar_checker.do";
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ sentence: text }).toString()
    });
    
    const result = await response.text();
    console.log(result);
  } catch(e) {
    console.error(e);
  }
}
testDaum();
