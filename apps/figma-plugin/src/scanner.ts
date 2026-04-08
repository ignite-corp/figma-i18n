import { readPluginData } from "./plugin-data";
import type { ExtractedNode } from "shared-types";

/** 선택된 노드들 내의 모든 TEXT 노드를 재귀 탐색하여 추출 */
export function scanSelection(): ExtractedNode[] {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return [];

  const textNodes: ExtractedNode[] = [];

  for (const node of selection) {
    collectTextNodes(node, [], textNodes);
  }

  return textNodes;
}

function collectTextNodes(
  node: SceneNode,
  parentChain: string[],
  result: ExtractedNode[],
): void {
  // 숨겨진 노드 스킵
  if (!node.visible) return;

  if (node.type === "TEXT") {
    const text = node.characters.trim();
    if (!text) return;
    if (shouldSkip(text)) return;

    const parentPath = [...parentChain, node.name].join(" > ");
    const pluginData = readPluginData(node);

    const extracted: ExtractedNode = {
      nodeId: node.id,
      text,
      parentPath,
      metadata: {
        fontSize: typeof node.fontSize === "number" ? node.fontSize : undefined,
        fontWeight:
          typeof node.fontWeight === "number"
            ? String(node.fontWeight)
            : undefined,
        width: Math.round(node.width),
        height: Math.round(node.height),
      },
    };

    // 기존 pluginData가 있으면 포함
    if (pluginData) {
      extracted.existingMapping = {
        key: pluginData.key,
        sourceText: pluginData.sourceText,
      };
    }

    result.push(extracted);
    return;
  }

  // 자식 노드 재귀 탐색
  if ("children" in node) {
    const chain = [...parentChain, node.name];
    for (const child of node.children) {
      collectTextNodes(child, chain, result);
    }
  }
}

/** 번역 불필요 텍스트 필터링 */
function shouldSkip(text: string): boolean {
  // 순수 숫자/기호만
  if (/^[\d\s.,\-%+:\/]+$/.test(text)) return true;
  // 1글자 특수문자
  if (text.length === 1 && /[^\w가-힣]/.test(text)) return true;
  // 더미 텍스트
  if (/^(lorem|ipsum|placeholder)/i.test(text)) return true;

  return false;
}
