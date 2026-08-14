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
}

export interface KeyUpdateResponse {
  key: KeyEntry;
}

export type BulkKeyMode = "create" | "update";

export interface BulkKeyItem {
  keyName: string;
  value: string;
  mode: BulkKeyMode;
}

export interface BulkKeysRequest {
  items: BulkKeyItem[];
  projectId?: string;
  figmaFileId?: string;
  triggeredBy?: string;
}

export interface BulkKeyResult {
  keyName: string;
  mode: BulkKeyMode;
  success: boolean;
  error?: string;
}

export interface BulkKeysResponse {
  results: BulkKeyResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}
