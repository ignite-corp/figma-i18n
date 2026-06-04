import { logger } from "../lib/logger";

const HCHAT_ENDPOINT = "https://internal-apigw-kr.hmg-corp.io/hchat-in/api/v3/openai/responses";

const TRANSLATION_INSTRUCTIONS =
  "You are a professional software localization translator. Translate the input JSON values from English to French. " +
  "Preserve the exact JSON structure and all keys. Translate only string values intended for users. " +
  "Do not translate keys, variable names, placeholders, HTML tags, ICU message syntax, URLs, or code snippets. " +
  "Keep newline characters, escape sequences, punctuation, and spacing consistent. Return valid JSON only.";

export async function translateEnToFr(
  texts: Record<string, string>,
  apiKey: string,
): Promise<Record<string, string>> {
  if (Object.keys(texts).length === 0) return {};

  const body = {
    model: "gpt-5.4",
    instructions: TRANSLATION_INSTRUCTIONS,
    input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(texts) }] }],
    text: { format: { type: "text" }, verbosity: "medium" },
    temperature: 0.2,
    max_output_tokens: 4000,
    stream: false,
    truncation: "auto",
  };

  logger.info({ count: Object.keys(texts).length }, "HChat 번역 요청");

  let res: Response;
  try {
    res = await fetch(HCHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.error({ err }, "HChat 네트워크 오류 — 원문 반환");
    return texts;
  }

  if (!res.ok) {
    logger.error({ status: res.status }, "HChat API 오류 — 원문 반환");
    return texts;
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    logger.error("HChat 응답 JSON 파싱 실패 — 원문 반환");
    return texts;
  }

  const rawText =
    (data as { output?: Array<{ content?: Array<{ text?: string }> }> })
      ?.output?.[0]?.content?.[0]?.text ?? "";

  try {
    const translated = JSON.parse(rawText) as Record<string, string>;
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(texts)) {
      result[k] = typeof translated[k] === "string" ? translated[k] : v;
    }
    logger.info({ result }, "HChat 번역 완료");
    return result;
  } catch {
    logger.error({ rawText }, "HChat 응답 파싱 실패 — 원문 반환");
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
