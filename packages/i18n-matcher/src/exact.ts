import type { CachedKey, MatchResult } from "shared-types";

/** value가 정확히 일치하는 key 찾기 */
export function exactMatch(
  text: string,
  keys: CachedKey[],
): MatchResult[] {
  return keys
    .filter((k) => k.baseValue === text)
    .map((k) => ({
      keyName: k.keyName,
      value: k.baseValue,
      matchType: "exact" as const,
      score: 1.0,
    }));
}
