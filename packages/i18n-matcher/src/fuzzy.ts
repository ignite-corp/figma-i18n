import type { CachedKey, MatchResult } from "shared-types";

/**
 * Levenshtein distance 계산
 * 짧은 문자열 최적화 (행렬 대신 1차원 배열)
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) {
      prev[j] = curr[j];
    }
  }

  return curr[b.length];
}

/** 유사도 점수 (0~1) */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/** fuzzy 매칭: threshold 이상의 유사도를 가진 key를 score 내림차순 반환 */
export function fuzzyMatch(
  text: string,
  keys: CachedKey[],
  threshold = 0.8,
  maxResults = 5,
): MatchResult[] {
  const results: MatchResult[] = [];

  for (const key of keys) {
    const score = similarity(text, key.baseValue);
    if (score >= threshold) {
      results.push({
        keyName: key.keyName,
        value: key.baseValue,
        matchType: "fuzzy" as const,
        score: Math.round(score * 100) / 100,
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}
