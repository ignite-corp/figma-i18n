import type { NodeStatus, ExtractedNode, ScanResultNode } from "shared-types";

/** 서버 응답을 기반으로 최종 상태 분류 (클라이언트 보조용) */
export function classifyNode(
  node: ExtractedNode,
  serverResult?: ScanResultNode,
): NodeStatus {
  // 서버 응답이 있으면 서버 결과 사용
  if (serverResult) return serverResult.status;

  // 서버 응답 없이 로컬에서 판단 (fallback)
  if (node.existingMapping) {
    return node.text === node.existingMapping.sourceText
      ? "matched"
      : "changed";
  }

  return "new";
}
