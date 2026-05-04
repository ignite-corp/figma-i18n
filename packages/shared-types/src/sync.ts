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
}

export interface SyncRequest {
  figmaFileId: string;
  triggeredBy: string;
  items: SyncItem[];
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
