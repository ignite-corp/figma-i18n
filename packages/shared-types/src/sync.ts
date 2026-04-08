// Sync 관련 타입

export type SyncItemAction =
  | "link_existing"
  | "create_new"
  | "update_source"
  | "ignore";

export interface SyncItem {
  nodeId: string;
  action: SyncItemAction;
  keyName?: string;
  text: string;
  previousText?: string;
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
