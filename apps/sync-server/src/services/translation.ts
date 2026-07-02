import { logger } from "../lib/logger";

type DeepLResponse = {
  translations: Array<{ text: string }>;
};

// {{variable}} 안의 내용은 번역되면 안 되므로 DeepL XML 태그 핸들링으로 보호한다.
const IGNORE_TAG = "x";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** {{...}} 변수를 ignore 태그로 감싸 번역에서 제외한다. */
function protectVariables(text: string): string {
  return escapeXml(text).replace(
    /\{\{.*?\}\}/g,
    (match) => `<${IGNORE_TAG}>${match}</${IGNORE_TAG}>`,
  );
}

/** ignore 태그를 제거하고 XML 이스케이프를 원복한다. */
function restoreVariables(text: string): string {
  const stripped = text.replace(
    new RegExp(`</?${IGNORE_TAG}\\s*/?>`, "g"),
    "",
  );
  return unescapeXml(stripped);
}

export async function translateEnToFr(
  texts: Record<string, string>,
  deeplApiKey: string,
): Promise<{ translations: Record<string, string>; hasErrors: boolean }> {
  if (Object.keys(texts).length === 0) {
    return { translations: {}, hasErrors: false };
  }

  const entries = Object.entries(texts);
  logger.info({ count: entries.length }, "DeepL 배치 번역 요청");

  // DeepL Free API는 api-free.deepl.com, Pro는 api.deepl.com
  const baseUrl = deeplApiKey.endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";

  try {
    const res = await fetch(`${baseUrl}/v2/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `DeepL-Auth-Key ${deeplApiKey}`,
      },
      body: JSON.stringify({
        text: entries.map(([, text]) => protectVariables(text)),
        source_lang: "EN",
        target_lang: "FR",
        tag_handling: "xml",
        ignore_tags: [IGNORE_TAG],
        outline_detection: false,
      }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "DeepL 배치 번역 실패 — 전체 원문 반환");
      return { translations: Object.fromEntries(entries), hasErrors: true };
    }

    const data = await res.json() as DeepLResponse;

    let hasErrors = false;
    const translations: Record<string, string> = {};
    entries.forEach(([key, originalText], i) => {
      const rawTranslated = data.translations[i]?.text;
      const translated =
        rawTranslated !== undefined ? restoreVariables(rawTranslated) : undefined;
      if (translated && translated !== originalText) {
        translations[key] = translated;
      } else {
        translations[key] = originalText;
        if (!translated) hasErrors = true;
      }
    });

    logger.info({ count: entries.length, hasErrors }, "DeepL 배치 번역 완료");
    return { translations, hasErrors };
  } catch (err) {
    logger.error({ err }, "DeepL 네트워크 오류 — 전체 원문 반환");
    return { translations: Object.fromEntries(entries), hasErrors: true };
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
