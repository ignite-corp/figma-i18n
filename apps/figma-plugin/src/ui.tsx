import type {
  ExtractedNode,
  ScanResultNode,
  ScanResponse,
  NodeStatus,
  SyncItem,
  I18nPluginData,
} from "shared-types";
import {
  scanNodes,
  syncItems,
  getCacheStatus,
  searchKeys,
  setServerUrl,
  getServerUrl,
} from "./api-client";

// ─── State ───
let figmaFileKey = "";
let extractedNodes: ExtractedNode[] = [];
let scanResults: ScanResultNode[] = [];
let activeFilter: NodeStatus | "all" = "all";
let serverUrlInput = getServerUrl();
let isLoading = false;
let userEmail = "";

// 사용자가 선택한 action 저장
const userActions: Map<
  string,
  { action: SyncItem["action"]; keyName?: string }
> = new Map();

// ─── Plugin message handling ───
window.onmessage = async (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case "scan-result":
      extractedNodes = msg.payload as ExtractedNode[];
      await handleScanResult();
      break;
    case "file-key":
      figmaFileKey = msg.payload as string;
      break;
    case "selection-changed":
      updateSelectionInfo(msg.payload);
      break;
    case "bulk-save-done":
      showNotify("pluginData 저장 완료!");
      break;
  }
};

// 파일 키 요청
postToPlugin("get-file-key");

// ─── Scan logic ───
async function handleScanResult() {
  if (extractedNodes.length === 0) {
    renderEmpty("선택된 영역에 텍스트 노드가 없습니다");
    return;
  }

  setLoading(true);

  try {
    const response: ScanResponse = await scanNodes({
      figmaFileId: figmaFileKey || "unknown",
      nodes: extractedNodes,
    });

    scanResults = response.results;
    userActions.clear();
    render();
  } catch (err) {
    renderError(`서버 연결 실패: ${err instanceof Error ? err.message : err}`);
  } finally {
    setLoading(false);
  }
}

// ─── Sync logic ───
async function handleSync() {
  const items: SyncItem[] = [];
  const pluginDataUpdates: Array<{ nodeId: string; data: I18nPluginData }> = [];

  for (const result of scanResults) {
    const userAction = userActions.get(result.nodeId);
    if (!userAction) continue;

    items.push({
      nodeId: result.nodeId,
      action: userAction.action,
      keyName: userAction.keyName,
      text: result.text,
      previousText: result.existingMapping?.previousText,
    });

    // pluginData 업데이트 준비
    if (userAction.action !== "ignore" && userAction.keyName) {
      pluginDataUpdates.push({
        nodeId: result.nodeId,
        data: {
          key: userAction.keyName,
          status: "matched",
          sourceText: result.text,
          linkedAt: new Date().toISOString(),
          syncedAt: new Date().toISOString(),
        },
      });
    }
  }

  if (items.length === 0) {
    showNotify("동기화할 항목이 없습니다. 항목을 먼저 선택해주세요.");
    return;
  }

  setLoading(true);

  try {
    const response = await syncItems({
      figmaFileId: figmaFileKey || "unknown",
      triggeredBy: userEmail || "unknown",
      items,
    });

    // Figma pluginData 일괄 저장
    if (pluginDataUpdates.length > 0) {
      postToPlugin("save-mappings-bulk", pluginDataUpdates);
    }

    showNotify(
      `동기화 완료: ${response.summary.succeeded}건 성공, ${response.summary.failed}건 실패`,
    );

    // 결과 반영 후 재렌더
    for (const item of response.results) {
      if (item.success) {
        const idx = scanResults.findIndex((r) => r.nodeId === item.nodeId);
        if (idx !== -1) {
          scanResults[idx] = { ...scanResults[idx], status: "matched" };
        }
      }
    }
    render();
  } catch (err) {
    showNotify(`동기화 실패: ${err instanceof Error ? err.message : err}`);
  } finally {
    setLoading(false);
  }
}

// ─── Rendering ───
function render() {
  const root = document.getElementById("root")!;

  const filtered =
    activeFilter === "all"
      ? scanResults
      : scanResults.filter((r) => r.status === activeFilter);

  const summary = {
    total: scanResults.length,
    matched: scanResults.filter((r) => r.status === "matched").length,
    candidate: scanResults.filter((r) => r.status === "candidate").length,
    new: scanResults.filter((r) => r.status === "new").length,
    changed: scanResults.filter((r) => r.status === "changed").length,
    ignored: scanResults.filter((r) => r.status === "ignored").length,
  };

  const pendingCount = userActions.size;

  root.innerHTML = `
    <div class="container">
      <div class="server-config">
        <label>Server URL</label>
        <input type="text" id="server-url" value="${serverUrlInput}" />
      </div>
      <div class="server-config">
        <label>Email (triggeredBy)</label>
        <input type="text" id="user-email" value="${userEmail}" placeholder="your@email.com" />
      </div>

      <div class="header">
        <h2>i18n Scan Results</h2>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-primary" id="btn-scan">🔍 스캔</button>
          <button class="btn btn-primary" id="btn-sync" ${pendingCount === 0 ? "disabled" : ""}>
            🚀 동기화 (${pendingCount})
          </button>
        </div>
      </div>

      <div class="summary">
        <span class="summary-item">전체 <span class="summary-count">${summary.total}</span></span>
        <span class="summary-item">✅ <span class="summary-count">${summary.matched}</span></span>
        <span class="summary-item">🟡 <span class="summary-count">${summary.candidate}</span></span>
        <span class="summary-item">🔵 <span class="summary-count">${summary.new}</span></span>
        <span class="summary-item">🔴 <span class="summary-count">${summary.changed}</span></span>
        <span class="summary-item">⚪ <span class="summary-count">${summary.ignored}</span></span>
      </div>

      <div class="filter-bar">
        ${renderFilterChips()}
      </div>

      <div class="node-list">
        ${filtered.map((r) => renderNodeItem(r)).join("")}
      </div>
    </div>
  `;

  bindEvents();
}

function renderFilterChips(): string {
  const filters: Array<{ key: NodeStatus | "all"; label: string }> = [
    { key: "all", label: "전체" },
    { key: "candidate", label: "후보" },
    { key: "new", label: "신규" },
    { key: "changed", label: "변경" },
    { key: "matched", label: "매칭" },
    { key: "ignored", label: "무시" },
  ];

  return filters
    .map(
      (f) =>
        `<button class="filter-chip ${activeFilter === f.key ? "active" : ""}" data-filter="${f.key}">${f.label}</button>`,
    )
    .join("");
}

function renderNodeItem(result: ScanResultNode): string {
  const userAction = userActions.get(result.nodeId);
  const node = extractedNodes.find((n) => n.nodeId === result.nodeId);

  return `
    <div class="node-item" data-node-id="${result.nodeId}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="badge badge-${result.status}">${result.status}</span>
        ${userAction ? `<span style="font-size:10px;color:#18A0FB;">✓ ${userAction.action}</span>` : ""}
      </div>
      <div class="node-text">"${escapeHtml(result.text)}"</div>
      <div class="node-path">${escapeHtml(node?.parentPath ?? "")}</div>

      ${result.existingMapping ? renderExistingMapping(result) : ""}
      ${result.candidates.length > 0 ? renderCandidates(result) : ""}
      ${result.status === "new" || result.status === "candidate" ? renderNewKeyInput(result) : ""}

      <div class="node-actions">
        ${result.status === "candidate" && result.candidates[0] ? `<button class="btn btn-sm btn-primary" data-action="link" data-node-id="${result.nodeId}" data-key="${result.candidates[0].keyName}">🔗 연결: ${result.candidates[0].keyName}</button>` : ""}
        ${result.status === "changed" ? `<button class="btn btn-sm btn-primary" data-action="update" data-node-id="${result.nodeId}" data-key="${result.existingMapping?.keyName}">📝 Source 업데이트</button>` : ""}
        ${result.status !== "matched" && result.status !== "ignored" ? `<button class="btn btn-sm btn-secondary" data-action="ignore" data-node-id="${result.nodeId}">무시</button>` : ""}
      </div>
    </div>
  `;
}

function renderExistingMapping(result: ScanResultNode): string {
  if (!result.existingMapping) return "";
  return `
    <div style="font-size:10px;color:#666;margin-bottom:4px;">
      Key: <code>${result.existingMapping.keyName}</code>
      ${result.status === "changed" ? `<br/>이전: "${result.existingMapping.previousText}" → 현재: "${result.existingMapping.currentText}"` : ""}
    </div>
  `;
}

function renderCandidates(result: ScanResultNode): string {
  return `
    <div class="candidate-list">
      ${result.candidates
        .map(
          (c) => `
        <div class="candidate-item">
          <span class="candidate-key">${c.keyName}</span>
          <div>
            <span style="font-size:10px;color:#666;">${c.matchType}</span>
            <span class="candidate-score">${(c.score * 100).toFixed(0)}%</span>
            <button class="btn btn-sm btn-secondary" data-action="link" data-node-id="${result.nodeId}" data-key="${c.keyName}">연결</button>
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderNewKeyInput(result: ScanResultNode): string {
  const suggested = result.suggestedKey || "";
  const currentKey = userActions.get(result.nodeId)?.keyName || suggested;

  return `
    <div style="margin-top:4px;">
      <input class="key-input" type="text" placeholder="domain.section.element.modifier" value="${currentKey}" data-key-input="${result.nodeId}" />
      <button class="btn btn-sm btn-primary" style="margin-top:4px;" data-action="create" data-node-id="${result.nodeId}">➕ 신규 Key 생성</button>
    </div>
  `;
}

function renderEmpty(message: string) {
  document.getElementById("root")!.innerHTML = `
    <div class="container">
      <div class="server-config">
        <label>Server URL</label>
        <input type="text" id="server-url" value="${serverUrlInput}" />
      </div>
      <div class="header">
        <h2>i18n Sync</h2>
        <button class="btn btn-primary" id="btn-scan">🔍 스캔</button>
      </div>
      <div class="empty">${message}</div>
    </div>
  `;
  bindEvents();
}

function renderError(message: string) {
  document.getElementById("root")!.innerHTML = `
    <div class="container">
      <div class="server-config">
        <label>Server URL</label>
        <input type="text" id="server-url" value="${serverUrlInput}" />
      </div>
      <div class="header">
        <h2>i18n Sync</h2>
        <button class="btn btn-primary" id="btn-scan">🔍 스캔</button>
      </div>
      <div class="empty" style="color:red;">${message}</div>
    </div>
  `;
  bindEvents();
}

function setLoading(loading: boolean) {
  isLoading = loading;
  if (loading) {
    document.getElementById("root")!.innerHTML = `
      <div class="container"><div class="loading">⏳ 처리 중...</div></div>
    `;
  }
}

// ─── Event Binding ───
function bindEvents() {
  // Server URL
  document.getElementById("server-url")?.addEventListener("change", (e) => {
    serverUrlInput = (e.target as HTMLInputElement).value;
    setServerUrl(serverUrlInput);
  });

  // Email
  document.getElementById("user-email")?.addEventListener("change", (e) => {
    userEmail = (e.target as HTMLInputElement).value;
  });

  // Scan button
  document.getElementById("btn-scan")?.addEventListener("click", () => {
    postToPlugin("scan");
  });

  // Sync button
  document.getElementById("btn-sync")?.addEventListener("click", () => {
    handleSync();
  });

  // Filter chips
  document.querySelectorAll("[data-filter]").forEach((el) => {
    el.addEventListener("click", () => {
      activeFilter = (el as HTMLElement).dataset.filter as NodeStatus | "all";
      render();
    });
  });

  // Action buttons
  document.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", () => {
      const action = (el as HTMLElement).dataset.action!;
      const nodeId = (el as HTMLElement).dataset.nodeId!;
      const key = (el as HTMLElement).dataset.key;

      if (action === "link" && key) {
        userActions.set(nodeId, { action: "link_existing", keyName: key });
      } else if (action === "create") {
        const input = document.querySelector(
          `[data-key-input="${nodeId}"]`,
        ) as HTMLInputElement;
        const keyName = input?.value?.trim();
        if (!keyName) {
          showNotify("Key 이름을 입력해주세요");
          return;
        }
        userActions.set(nodeId, { action: "create_new", keyName });
      } else if (action === "update" && key) {
        userActions.set(nodeId, { action: "update_source", keyName: key });
      } else if (action === "ignore") {
        userActions.set(nodeId, { action: "ignore" });
      }

      render();
    });
  });
}

function updateSelectionInfo(payload: {
  hasSelection: boolean;
  count: number;
}) {
  // 선택 변경 시 UI 힌트
}

// ─── Helpers ───
function postToPlugin(type: string, payload?: unknown) {
  parent.postMessage({ pluginMessage: { type, payload } }, "*");
}

function showNotify(message: string) {
  postToPlugin("notify", { message });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Initial render ───
renderEmpty("Frame을 선택하고 [스캔] 버튼을 눌러주세요");
