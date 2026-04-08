// 공통 타입

/** Figma plugin에서 저장하는 pluginData 스키마 */
export interface I18nPluginData {
  key: string;
  status: "matched" | "changed" | "ignored";
  sourceText: string;
  linkedAt: string; // ISO 8601
  syncedAt?: string;
}

/** 캐시 상태 */
export interface CacheStatusResponse {
  status: "idle" | "syncing" | "error";
  totalKeys: number;
  lastSyncAt: string | null;
}

/** 캐시 갱신 결과 */
export interface CacheRefreshResponse {
  status: "completed" | "error";
  totalKeys: number;
  duration: number; // ms
  lastSyncAt: string;
}

/** Key 검색 결과 */
export interface KeySearchResult {
  keyName: string;
  value: string;
  matchType: string;
}

export interface KeySearchResponse {
  results: KeySearchResult[];
}

/** Sync History 항목 */
export interface HistoryItem {
  id: string;
  figmaFileId: string;
  nodeId: string | null;
  keyName: string;
  action: string;
  prevValue: string | null;
  newValue: string | null;
  triggeredBy: string;
  createdAt: string;
}

export interface HistoryResponse {
  items: HistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

/** API 에러 응답 */
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
