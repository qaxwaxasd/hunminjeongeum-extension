const apiKey = "YOUR_API_KEY";
const GEMINI_SYSTEM_PROMPT = `당신은 한국어 맞춤법/문법 교정 전문가입니다.
주어진 텍스트에서 맞춤법, 문법, 띄어쓰기 오류를 찾아 JSON 배열로 반환하세요.

각 오류는 다음 형식으로 반환:
{"original": "틀린 표현", "suggestion": "올바른 표현", "reason": "교정 이유 설명", "type": "typo|grammar|spacing"}

type 분류 기준:
- typo: 맞춤법 오류, 오탈자, 철자 오류
- grammar: 문법 오류, 어법 오류, 조사 오류
- spacing: 띄어쓰기 오류

규칙:
- 오류가 없으면 빈 배열 [] 반환
- JSON 배열만 반환하고 다른 텍스트, 마크다운, 설명은 절대 포함하지 마세요
- reason은 간결하되 교육적으로 작성하세요
- 같은 오류가 반복되면 한 번만 보고하세요`;

async function testGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const text = "안녕하새요. 만나서 반갑습니당.";
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${GEMINI_SYSTEM_PROMPT}\n\n검사할 텍스트:\n"${text}"`
        }]
      }],
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 2048,
        responseMimeType: "application/json"
      }
    })
  });
  
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

testGemini();
