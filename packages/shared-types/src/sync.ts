// Sync 관련 타입

export type SyncItemAction =
  | "link_existing"
  | "create_new"
  | "update_source"
  | "ignore"
  | "delete_key";

export interface SyncItem {
  nodeId: string;
  action: SyncItemAction;
  keyName?: string;
  text: string;
  previousText?: string;
  /** 사용자가 명시적으로 지정한 번역 value (없으면 text 사용) */
  value?: string;
  /** 플러그인이 H Chat으로 번역한 FR 계열 결과 { fr: "...", fr_CA: "..." } */
  frTranslations?: Record<string, string>;
}

export interface SyncRequest {
  figmaFileId: string;
  triggeredBy: string;
  items: SyncItem[];
  projectId?: string;
  /** 신규 생성 key에 추가로 붙일 Lokalise 태그 (figma-sync는 항상 포함) */
  tags?: string[];
}

export interface SyncResultItem {
  nodeId: string;
  success: boolean;
  action: SyncItemAction;
  keyName?: string;
  lokaliseKeyId?: number;
  error?: string;
}

export interface SyncResponse {
  results: SyncResultItem[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}
