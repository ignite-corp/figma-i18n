// Scan 관련 타입

/** Figma 텍스트 노드에서 추출한 정보 */
export interface ExtractedNode {
  nodeId: string;
  text: string;
  parentPath: string;
  metadata?: NodeMetadata;
  existingMapping?: ExistingNodeMapping;
}

export interface NodeMetadata {
  fontSize?: number;
  fontWeight?: string;
  width?: number;
  height?: number;
}

export interface ExistingNodeMapping {
  key: string;
  sourceText: string;
}

/** 스캔 요청 */
export interface ScanRequest {
  figmaFileId: string;
  nodes: ExtractedNode[];
  projectId?: string;
}

/** 매칭 후보 */
export interface MatchCandidate {
  keyName: string;
  value: string;
  matchType: MatchType;
  score: number;
}

export type MatchType = "exact" | "normalized" | "common_dictionary" | "fuzzy";

/** 노드 상태 */
export type NodeStatus =
  | "matched"
  | "candidate"
  | "new"
  | "changed"
  | "ignored";

/** 기존 매핑 정보 (서버 응답용) */
export interface ExistingMappingInfo {
  keyName: string;
  previousText?: string;
  currentText?: string;
}

/** 스캔 결과 (노드별) */
export interface ScanResultNode {
  nodeId: string;
  text: string;
  status: NodeStatus;
  existingMapping: ExistingMappingInfo | null;
  candidates: MatchCandidate[];
  suggestedKey: string | null;
}

/** 스캔 응답 */
export interface ScanResponse {
  results: ScanResultNode[];
  summary: ScanSummary;
}

export interface ScanSummary {
  total: number;
  matched: number;
  candidate: number;
  new: number;
  changed: number;
  ignored: number;
}
