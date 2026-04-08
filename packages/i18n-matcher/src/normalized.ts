import type { CachedKey, MatchResult } from "shared-types";
import { normalizeForComparison } from "./normalizer";

/** 공백/대소문자 정규화 후 매칭 */
export function normalizedMatch(
  text: string,
  keys: CachedKey[],
): MatchResult[] {
  const normalizedText = normalizeForComparison(text);

  return keys
    .filter((k) => normalizeForComparison(k.baseValue) === normalizedText)
    .map((k) => ({
      keyName: k.keyName,
      value: k.baseValue,
      matchType: "normalized" as const,
      score: 0.95,
    }));
}
