import { logger } from "../lib/logger";

export async function translateEnToFr(
  texts: Record<string, string>,
  libreTranslateUrl: string,
  apiKey?: string,
): Promise<{ translations: Record<string, string>; hasErrors: boolean }> {
  if (Object.keys(texts).length === 0) {
    return { translations: {}, hasErrors: false };
  }

  const entries = Object.entries(texts);
  logger.info({ count: entries.length, url: libreTranslateUrl }, "LibreTranslate 배치 번역 요청");

  const body: Record<string, unknown> = {
    q: entries.map(([, text]) => text),
    source: "en",
    target: "fr",
    format: "text",
  };
  if (apiKey) body.api_key = apiKey;

  try {
    const res = await fetch(`${libreTranslateUrl}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "LibreTranslate 배치 번역 실패 — 전체 원문 반환");
      return {
        translations: Object.fromEntries(entries),
        hasErrors: true,
      };
    }

    const data = await res.json() as Array<{ translatedText?: string }>;

    let hasErrors = false;
    const translations: Record<string, string> = {};
    entries.forEach(([key, originalText], i) => {
      const translated = data[i]?.translatedText;
      if (translated && translated !== originalText) {
        translations[key] = translated;
      } else {
        translations[key] = originalText;
        if (!translated) hasErrors = true;
      }
    });

    logger.info({ count: entries.length, hasErrors }, "LibreTranslate 배치 번역 완료");
    return { translations, hasErrors };
  } catch (err) {
    logger.error({ err }, "LibreTranslate 네트워크 오류 — 전체 원문 반환");
    return {
      translations: Object.fromEntries(entries),
      hasErrors: true,
    };
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
