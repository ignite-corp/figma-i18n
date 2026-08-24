// Key 직접 검색/수정 및 JSON 대량 추가 관련 타입

export interface KeyEntry {
  lokaliseKeyId: number;
  keyName: string;
  baseValue: string;
}

export interface KeyFindResponse {
  results: KeyEntry[];
  total: number;
}

export interface KeyLookupRequest {
  keyNames: string[];
  projectId?: string;
}

export interface KeyLookupResponse {
  found: KeyEntry[];
}

export interface KeyUpdateRequest {
  keyName: string;
  value: string;
  projectId?: string;
  figmaFileId?: string;
  triggeredBy?: string;
  /** 사용자가 화면에서 보고 있던 값. Lokalise 최신 값과 다르면 충돌로 처리 */
  expectedValue?: string;
  /** 충돌을 무시하고 덮어쓰기 */
  force?: boolean;
}

export interface KeyUpdateResponse {
  /** conflict인 경우 아무것도 쓰지 않았으며 key.baseValue가 Lokalise 최신 값 */
  status: "updated" | "conflict";
  key: KeyEntry;
}

export type BulkKeyMode = "create" | "update";

export interface BulkKeyItem {
  keyName: string;
  value: string;
  mode: BulkKeyMode;
  /** 미리보기 시점에 확인한 Lokalise 값. 반영 직전 값이 달라졌으면 충돌로 처리 */
  expectedValue?: string;
}

export interface BulkKeysRequest {
  items: BulkKeyItem[];
  projectId?: string;
  figmaFileId?: string;
  triggeredBy?: string;
  /** 신규 생성 key에 추가로 붙일 Lokalise 태그 (figma-sync는 항상 포함) */
  tags?: string[];
}

export interface BulkKeyResult {
  keyName: string;
  mode: BulkKeyMode;
  success: boolean;
  error?: string;
  /** Lokalise 최신 상태와 어긋나 건너뛴 항목 */
  conflict?: boolean;
}

export interface BulkKeysResponse {
  results: BulkKeyResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}
