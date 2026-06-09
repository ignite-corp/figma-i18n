import type {
  ExtractedNode,
  ScanResultNode,
  NodeStatus,
  MatchCandidate,
} from "shared-types";
import { findMatches } from "i18n-matcher";
import { getCachedKeys } from "./cache";
import { prisma } from "../lib/prisma";
import { loadConfig, resolveProjectId } from "../config";

const config = loadConfig();

/** 노드 목록을 매칭하여 결과 반환 */
export async function matchNodes(
  figmaFileId: string,
  nodes: ExtractedNode[],
  projectId?: string,
): Promise<ScanResultNode[]> {
  const cachedKeys = await getCachedKeys(projectId);
  const resolvedProjectId = resolveProjectId(config, projectId);
  const results: ScanResultNode[] = [];

  // 기존 매핑 정보 한 번에 조회 (프로젝트 단위로 격리)
  const existingMappings = await prisma.figmaKeyMapping.findMany({
    where: {
      figmaFileId,
      nodeId: { in: nodes.map((n) => n.nodeId) },
      projectId: resolvedProjectId,
    },
  });

  const mappingMap = new Map(
    existingMappings.map((m) => [m.nodeId, m]),
  );

  for (const node of nodes) {
    const dbMapping = mappingMap.get(node.nodeId);
    const pluginMapping = node.existingMapping;

    // 매핑 정보 결정 (plugin 우선, 없으면 DB)
    const existingKey = pluginMapping?.key ?? dbMapping?.keyName;
    const existingSourceText = pluginMapping?.sourceText ?? dbMapping?.sourceText;

    let status: NodeStatus;
    let candidates: MatchCandidate[] = [];
    let suggestedKey: string | null = null;

    if (existingKey && existingSourceText) {
      // 이미 매핑된 노드
      if (node.text === existingSourceText) {
        status = "matched";
      } else {
        status = "changed";
      }
    } else {
      // 매핑되지 않은 노드 — 매칭 시도
      const matches = findMatches(node.text, cachedKeys);
      candidates = matches;

      if (matches.length > 0) {
        status = "candidate";
      } else {
        status = "new";
        suggestedKey = generateSuggestedKey(node.parentPath);
      }
    }

    results.push({
      nodeId: node.nodeId,
      text: node.text,
      status,
      existingMapping: existingKey
        ? {
            keyName: existingKey,
            previousText: existingSourceText,
            currentText: node.text !== existingSourceText ? node.text : undefined,
          }
        : null,
      candidates,
      suggestedKey,
    });
  }

  return results;
}

/** Figma parent path에서 key 자동 제안 */
function generateSuggestedKey(parentPath: string): string {
  const segments = parentPath
    .split(/[>/]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) =>
      s
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/[^A-Z0-9가-힣_]/g, ""),
    )
    .slice(0, 3); // 최대 3 세그먼트

  if (segments.length === 0) return "UNTITLED_TEXT_LABEL";

  return [...segments, "LABEL"].join("_");
}
