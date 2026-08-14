import { readPluginData, writePluginData } from "./plugin-data";

export interface TextApplyItem {
  keyName: string;
  /** Figma에 넣을 실제 텍스트 (개행은 실제 개행 문자) */
  value: string;
}

export interface NodeTextApplyItem {
  nodeId: string;
  /** Figma에 넣을 실제 텍스트 (개행은 실제 개행 문자) */
  value: string;
}

export interface TextApplyResult {
  updated: number;
  failed: number;
  /** 대상 노드를 찾지 못한 key 또는 nodeId */
  notFound: string[];
}

/**
 * pluginData의 key를 기준으로 현재 페이지의 TEXT 노드를 찾아 값으로 교체한다.
 * 한 key가 여러 노드에 연결돼 있으면 모두 반영한다.
 */
export async function applyTextsByKey(
  items: TextApplyItem[],
): Promise<TextApplyResult> {
  const byKey = new Map(items.map((i) => [i.keyName, i.value]));
  const matchedKeys = new Set<string>();
  let updated = 0;
  let failed = 0;

  const textNodes = figma.currentPage.findAllWithCriteria({ types: ["TEXT"] });

  for (const node of textNodes) {
    const data = readPluginData(node);
    if (!data?.key) continue;

    const value = byKey.get(data.key);
    if (value === undefined) continue;

    matchedKeys.add(data.key);
    if (node.characters === value) continue;

    try {
      await loadFonts(node);
      node.characters = value;
      writePluginData(node, {
        ...data,
        sourceText: value,
        syncedAt: new Date().toISOString(),
      });
      updated++;
    } catch (err) {
      console.error(`텍스트 반영 실패 [${data.key}]`, err);
      failed++;
    }
  }

  return {
    updated,
    failed,
    notFound: items.map((i) => i.keyName).filter((k) => !matchedKeys.has(k)),
  };
}

/**
 * nodeId로 직접 TEXT 노드를 찾아 값으로 교체한다.
 * 스캔 탭처럼 대상 노드가 이미 정해져 있을 때 사용한다.
 */
export async function applyTextsByNodeId(
  items: NodeTextApplyItem[],
): Promise<TextApplyResult> {
  let updated = 0;
  let failed = 0;
  const notFound: string[] = [];

  for (const item of items) {
    const node = figma.getNodeById(item.nodeId);
    if (!node || node.type !== "TEXT") {
      notFound.push(item.nodeId);
      continue;
    }
    if (node.characters === item.value) continue;

    try {
      await loadFonts(node);
      node.characters = item.value;

      const data = readPluginData(node);
      if (data) {
        writePluginData(node, {
          ...data,
          sourceText: item.value,
          syncedAt: new Date().toISOString(),
        });
      }
      updated++;
    } catch (err) {
      console.error(`텍스트 반영 실패 [${item.nodeId}]`, err);
      failed++;
    }
  }

  return { updated, failed, notFound };
}

/** 텍스트 수정 전 노드가 사용하는 모든 폰트를 로드 */
async function loadFonts(node: TextNode): Promise<void> {
  const fonts =
    node.characters.length > 0
      ? node.getRangeAllFontNames(0, node.characters.length)
      : node.fontName === figma.mixed
        ? []
        : [node.fontName];

  await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
}
