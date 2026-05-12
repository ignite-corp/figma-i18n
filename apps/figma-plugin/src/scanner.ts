import { readPluginData } from "./plugin-data";
import type { ExtractedNode } from "shared-types";

/** 선택된 노드들 내의 모든 TEXT 노드를 재귀 탐색하여 추출
 *
 * annotationCategoryIds가 주어지면:
 *   - Frame/Group 등에 해당 categoryId의 annotation이 달린 경우 → 하위 TEXT 전부 수집
 *   - TEXT 노드에 직접 annotation이 달린 경우 → 해당 노드만 수집
 *   - 둘 다 없으면 스킵
 * annotationCategoryIds가 없으면 기존처럼 전체 수집
 */
export function scanSelection(annotationCategoryIds?: string[]): ExtractedNode[] {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return [];

  const textNodes: ExtractedNode[] = [];

  for (const node of selection) {
    collectTextNodes(node, [], textNodes, annotationCategoryIds, false);
  }

  return textNodes;
}

function collectTextNodes(
  node: SceneNode,
  parentChain: string[],
  result: ExtractedNode[],
  annotationCategoryIds: string[] | undefined,
  isInsideAnnotatedFrame: boolean,
): void {
  // 숨겨진 노드 스킵
  if (!node.visible) return;

  if (node.type === "TEXT") {
    const text = node.characters.trim();
    if (!text) return;
    if (shouldSkip(text)) return;

    // annotation 필터가 있을 때: 부모 frame에서 내려왔거나 직접 annotation이 달린 경우만 수집
    if (annotationCategoryIds && !isInsideAnnotatedFrame && !hasTargetAnnotation(node, annotationCategoryIds)) {
      return;
    }

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
    const frameAnnotated = hasTargetAnnotation(node, annotationCategoryIds);
    for (const child of node.children) {
      collectTextNodes(child, chain, result, annotationCategoryIds, isInsideAnnotatedFrame || frameAnnotated);
    }
  }
}

/** 노드에 특정 categoryId의 annotation이 달려 있는지 확인 */
function hasTargetAnnotation(node: SceneNode, categoryIds: string[] | undefined): boolean {
  if (!categoryIds || categoryIds.length === 0) return false;
  if (!("annotations" in node)) return false;
  const annotations = (node as unknown as { annotations?: ReadonlyArray<{ categoryId?: string }> }).annotations;
  if (!annotations || annotations.length === 0) return false;
  return annotations.some((a) => a.categoryId !== undefined && categoryIds.includes(a.categoryId));
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
