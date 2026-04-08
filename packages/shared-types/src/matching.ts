// 매칭 관련 타입

/** Lokalise key 캐시 항목 */
export interface CachedKey {
  lokaliseKeyId: number;
  keyName: string;
  baseValue: string;
  platforms: string[];
  tags: string[];
}

/** 매칭 결과 */
export interface MatchResult {
  keyName: string;
  value: string;
  matchType: "exact" | "normalized" | "common_dictionary" | "fuzzy";
  score: number;
}

/** 매칭 옵션 */
export interface MatchOptions {
  fuzzyThreshold?: number; // 기본 0.8
  maxCandidates?: number; // 기본 5
  includeCommonDict?: boolean; // 기본 true
}
