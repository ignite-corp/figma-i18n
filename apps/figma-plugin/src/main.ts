import { scanSelection } from "./scanner";
import { readPluginData, writePluginData } from "./plugin-data";
import type { I18nPluginData } from "shared-types";

figma.showUI(__html__, { width: 420, height: 600, themeColors: true });

// ─── Plugin → UI 메시지 핸들링 ───
figma.ui.onmessage = async (msg: { type: string; payload?: unknown }) => {
  switch (msg.type) {
    case "scan": {
      const nodes = scanSelection();
      figma.ui.postMessage({ type: "scan-result", payload: nodes });
      break;
    }

    case "save-mapping": {
      const { nodeId, data } = msg.payload as {
        nodeId: string;
        data: I18nPluginData;
      };
      const node = figma.getNodeById(nodeId);
      if (node) {
        writePluginData(node, data);
      }
      break;
    }

    case "save-mappings-bulk": {
      const items = msg.payload as Array<{
        nodeId: string;
        data: I18nPluginData;
      }>;
      for (const { nodeId, data } of items) {
        const node = figma.getNodeById(nodeId);
        if (node) {
          writePluginData(node, data);
        }
      }
      figma.ui.postMessage({ type: "bulk-save-done" });
      break;
    }

    case "read-plugin-data": {
      const { nodeId } = msg.payload as { nodeId: string };
      const node = figma.getNodeById(nodeId);
      if (node) {
        const data = readPluginData(node);
        figma.ui.postMessage({
          type: "plugin-data",
          payload: { nodeId, data },
        });
      }
      break;
    }

    case "get-file-key": {
      figma.ui.postMessage({
        type: "file-key",
        payload: figma.fileKey,
      });
      break;
    }

    case "notify": {
      const { message } = msg.payload as { message: string };
      figma.notify(message);
      break;
    }

    case "close": {
      figma.closePlugin();
      break;
    }
  }
};

// 선택 변경 감지
figma.on("selectionchange", () => {
  const hasSelection = figma.currentPage.selection.length > 0;
  figma.ui.postMessage({
    type: "selection-changed",
    payload: { hasSelection, count: figma.currentPage.selection.length },
  });
});
