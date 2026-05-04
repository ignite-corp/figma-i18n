import { logger } from "../lib/logger";

const HCHAT_ENDPOINT = "https://internal-apigw-kr.hmg-corp.io/hchat-in/api/v3/openai/responses";

const TRANSLATION_INSTRUCTIONS =
  "You are a professional software localization translator. Translate the input JSON values from English to French. " +
  "Preserve the exact JSON structure and all keys. Translate only string values intended for users. " +
  "Do not translate keys, variable names, placeholders, HTML tags, ICU message syntax, URLs, or code snippets. " +
  "Keep newline characters, escape sequences, punctuation, and spacing consistent. Return valid JSON only.";

/**
 * EN 텍스트 맵을 FR로 일괄 번역한다.
 * @param texts  { [nodeId]: enText } 형태의 맵
 * @param apiKey H_CHAT_API_KEY
 * @returns      { [nodeId]: frText } — 번역 실패한 항목은 원문 유지
 */
export async function translateEnToFr(
  texts: Record<string, string>,
  apiKey: string,
): Promise<Record<string, string>> {
  if (Object.keys(texts).length === 0) return {};

  const inputJson = JSON.stringify(texts);

  const body = {
    model: "gpt-5.4",
    instructions: TRANSLATION_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: inputJson }],
      },
    ],
    text: { format: { type: "text" }, verbosity: "medium" },
    temperature: 0.2,
    max_output_tokens: 4000,
    stream: false,
    truncation: "auto",
  };

  let res: Response;
  try {
    res = await fetch(HCHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.error({ err }, "HChat API network error — falling back to source text");
    return texts;
  }

  if (!res.ok) {
    logger.error({ status: res.status, body: await res.text() }, "HChat API error — falling back to source text");
    return texts;
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    logger.error("HChat API returned non-JSON — falling back to source text");
    return texts;
  }

  // 응답 구조: data.output[0].content[0].text
  const rawText =
    (data as { output?: Array<{ content?: Array<{ text?: string }> }> })
      ?.output?.[0]?.content?.[0]?.text ?? "";

  try {
    const translated = JSON.parse(rawText) as Record<string, string>;
    // 누락된 key는 원문으로 보완
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(texts)) {
      result[k] = typeof translated[k] === "string" ? translated[k] : v;
    }
    return result;
  } catch {
    logger.error({ rawText }, "HChat translation response is not valid JSON — falling back to source text");
    return texts;
  }
}

/** lang_iso가 FR 계열인지 판별 */
export function isFrenchLocale(langIso: string): boolean {
  return langIso.toLowerCase().startsWith("fr");
}

/** lang_iso가 EN 계열인지 판별 */
export function isEnglishLocale(langIso: string): boolean {
  return langIso.toLowerCase().startsWith("en");
}
