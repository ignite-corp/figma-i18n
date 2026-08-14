import { on, showUI, emit } from "@create-figma-plugin/utilities";
import { scanSelection } from "./scanner";
import { readPluginData, writePluginData } from "./plugin-data";
import { applyTextsByKey, type TextApplyItem } from "./text-applier";
import type { I18nPluginData } from "shared-types";

export default function () {
  on("SCAN", (payload?: { annotationCategoryIds?: string[] }) => {
    const nodes = scanSelection(payload?.annotationCategoryIds);
    emit("SCAN_RESULT", nodes);
  });

  on("SAVE_MAPPING", (payload: { nodeId: string; data: I18nPluginData }) => {
    const node = figma.getNodeById(payload.nodeId);
    if (node) {
      writePluginData(node, payload.data);
    }
  });

  on("SAVE_MAPPINGS_BULK", (items: Array<{ nodeId: string; data: I18nPluginData }>) => {
    for (const { nodeId, data } of items) {
      const node = figma.getNodeById(nodeId);
      if (node) {
        writePluginData(node, data);
      }
    }
    emit("BULK_SAVE_DONE");
  });

  on("APPLY_TEXTS", async (items: TextApplyItem[]) => {
    const result = await applyTextsByKey(items);
    emit("APPLY_TEXTS_DONE", result);
  });

  on("READ_PLUGIN_DATA", (payload: { nodeId: string }) => {
    const node = figma.getNodeById(payload.nodeId);
    if (node) {
      const data = readPluginData(node);
      emit("PLUGIN_DATA", { nodeId: payload.nodeId, data });
    }
  });

  on("NOTIFY", (payload: { message: string }) => {
    figma.notify(payload.message);
  });

  on("CLOSE", () => {
    figma.closePlugin();
  });

  // 선택 변경 감지
  figma.on("selectionchange", () => {
    const hasSelection = figma.currentPage.selection.length > 0;
    emit("SELECTION_CHANGED", {
      hasSelection,
      count: figma.currentPage.selection.length,
    });
  });

  showUI({ width: 420, height: 600 });

  // 파일 키 전달 (showUI 이후에 호출해야 UI가 메시지를 수신할 수 있음)
  emit("FILE_KEY", figma.fileKey);
}
