import { logger } from "../lib/logger";

export async function translateEnToFr(
  texts: Record<string, string>,
  libreTranslateUrl: string,
  apiKey?: string,
): Promise<Record<string, string>> {
  if (Object.keys(texts).length === 0) return {};

  const entries = Object.entries(texts);
  logger.info({ count: entries.length, url: libreTranslateUrl }, "LibreTranslate 번역 요청");

  const results = await Promise.all(
    entries.map(async ([key, text]) => {
      const body: Record<string, string> = {
        q: text,
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
          logger.error({ status: res.status, key }, "LibreTranslate 번역 실패 — 원문 사용");
          return [key, text] as [string, string];
        }

        const data = await res.json() as { translatedText?: string };
        const translated = data.translatedText ?? text;
        logger.debug({ key, original: text, translated }, "번역 완료");
        return [key, translated] as [string, string];
      } catch (err) {
        logger.error({ err, key }, "LibreTranslate 네트워크 오류 — 원문 사용");
        return [key, text] as [string, string];
      }
    }),
  );

  const result = Object.fromEntries(results);
  logger.info({ count: entries.length }, "LibreTranslate 번역 완료");
  return result;
}

/** lang_iso가 FR 계열인지 판별 */
export function isFrenchLocale(langIso: string): boolean {
  return langIso.toLowerCase().startsWith("fr");
}

/** lang_iso가 EN 계열인지 판별 */
export function isEnglishLocale(langIso: string): boolean {
  return langIso.toLowerCase().startsWith("en");
}
