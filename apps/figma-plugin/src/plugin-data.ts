import type { I18nPluginData } from "shared-types";

const NAMESPACE = "figma-i18n";

/** pluginData에서 i18n 메타데이터 읽기 */
export function readPluginData(node: BaseNode): I18nPluginData | null {
  const raw = node.getPluginData(NAMESPACE);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as I18nPluginData;
  } catch {
    return null;
  }
}

/** pluginData에 i18n 메타데이터 쓰기 */
export function writePluginData(
  node: BaseNode,
  data: I18nPluginData,
): void {
  node.setPluginData(NAMESPACE, JSON.stringify(data));
}

/** pluginData 삭제 */
export function clearPluginData(node: BaseNode): void {
  node.setPluginData(NAMESPACE, "");
}
