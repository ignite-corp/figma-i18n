import type { CachedKey, MatchResult, MatchOptions } from "shared-types";
import { exactMatch } from "./exact";
import { normalizedMatch } from "./normalized";
import { commonDictionaryMatch } from "./common";
import { fuzzyMatch } from "./fuzzy";

export { exactMatch } from "./exact";
export { normalizedMatch } from "./normalized";
export { commonDictionaryMatch, getCommonDictionary } from "./common";
export { fuzzyMatch } from "./fuzzy";
export { normalizeForComparison, normalizeWhitespace, normalizeKeySegment } from "./normalizer";

const DEFAULT_OPTIONS: Required<MatchOptions> = {
  fuzzyThreshold: 0.8,
  maxCandidates: 5,
  includeCommonDict: true,
};

/**
 * 통합 매칭 파이프라인
 * 우선순위: exact → normalized → common dictionary → fuzzy
 * exact 매칭이 있으면 후순위는 건너뜀
 */
export function findMatches(
  text: string,
  keys: CachedKey[],
  options?: MatchOptions,
): MatchResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 1. Exact match
  const exact = exactMatch(text, keys);
  if (exact.length > 0) return exact.slice(0, opts.maxCandidates);

  // 2. Normalized match
  const normalized = normalizedMatch(text, keys);
  if (normalized.length > 0) return normalized.slice(0, opts.maxCandidates);

  // 3. Common dictionary match
  if (opts.includeCommonDict) {
    const common = commonDictionaryMatch(text);
    if (common) return [common];
  }

  // 4. Fuzzy match
  return fuzzyMatch(text, keys, opts.fuzzyThreshold, opts.maxCandidates);
}
