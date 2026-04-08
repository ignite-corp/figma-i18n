import { on, emit } from "@create-figma-plugin/utilities";
import type {
  ExtractedNode,
  ScanResultNode,
  NodeStatus,
  SyncItem,
  I18nPluginData,
  CacheStatusResponse,
} from "shared-types";
import {
  scanNodes,
  syncItems,
  getCacheStatus,
  refreshCache,
  setServerUrl,
  getServerUrl,
} from "./api-client";
import "./ui.css";

// ─── State ───
let figmaFileKey = "";
let extractedNodes: ExtractedNode[] = [];
let scanResults: ScanResultNode[] = [];
let activeFilter: NodeStatus | "all" = "all";
let serverUrlInput = getServerUrl();
let isLoading = false;
let userEmail = "";
let cacheStatus: CacheStatusResponse | null = null;
let isCacheRefreshing = false;

// 사용자가 선택한 action 저장
const userActions: Map<
  string,
  { action: SyncItem["action"]; keyName?: string }
> = new Map();

// ─── Plugin message handling ───
on("SCAN_RESULT", async (nodes: ExtractedNode[]) => {
  extractedNodes = nodes;
  await handleScanResult();
});

on("FILE_KEY", (fileKey: string) => {
  figmaFileKey = fileKey;
});

on("SELECTION_CHANGED", (_payload: { hasSelection: boolean; count: number }) => {
  // 선택 변경 시 UI 힌트 (추후 확장 가능)
});

on("BULK_SAVE_DONE", () => {
  showNotify("pluginData 저장 완료!");
});

// ─── Scan logic ───
async function handleScanResult() {
  if (extractedNodes.length === 0) {
    renderEmpty("선택된 영역에 텍스트 노드가 없습니다");
    return;
  }

  setLoading(true);

  try {
    const response = await scanNodes({
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

// ─── Cache refresh logic ───
async function handleRefreshCache() {
  if (isCacheRefreshing) return;
  isCacheRefreshing = true;
  render();

  try {
    const result = await refreshCache();
    cacheStatus = {
      status: "idle",
      totalKeys: result.totalKeys,
      lastSyncAt: result.lastSyncAt,
    };
    showNotify(`캐시 갱신 완료: ${result.totalKeys.toLocaleString()}개 키 (${result.duration}ms)`);
  } catch (err) {
    showNotify(`캐시 갱신 실패: ${err instanceof Error ? err.message : err}`);
  } finally {
    isCacheRefreshing = false;
    render();
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

    if (pluginDataUpdates.length > 0) {
      emit("SAVE_MAPPINGS_BULK", pluginDataUpdates);
    }

    showNotify(
      `동기화 완료: ${response.summary.succeeded}건 성공, ${response.summary.failed}건 실패`,
    );

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
  const root = document.getElementById("create-figma-plugin")!;

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
      ${renderSettingsPanel()}
      ${renderCacheStatus()}

      <div class="toolbar">
        <span class="toolbar-title">i18n Scan Results</span>
        <div class="toolbar-actions">
          <button class="btn btn-secondary" id="btn-scan">스캔</button>
          <button class="btn btn-secondary" id="btn-refresh-cache" ${isCacheRefreshing ? "disabled" : ""}>
            ${isCacheRefreshing ? "갱신 중..." : "캐시 갱신"}
          </button>
          <button class="btn btn-primary" id="btn-sync" ${pendingCount === 0 ? "disabled" : ""}>
            동기화 ${pendingCount > 0 ? `(${pendingCount})` : ""}
          </button>
        </div>
      </div>

      <div class="summary-bar">
        <span class="summary-item">전체 <span class="summary-count">${summary.total}</span></span>
        <span class="summary-item">매칭 <span class="summary-count">${summary.matched}</span></span>
        <span class="summary-item">후보 <span class="summary-count">${summary.candidate}</span></span>
        <span class="summary-item">신규 <span class="summary-count">${summary.new}</span></span>
        <span class="summary-item">변경 <span class="summary-count">${summary.changed}</span></span>
        <span class="summary-item">무시 <span class="summary-count">${summary.ignored}</span></span>
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

function renderSettingsPanel(): string {
  return `
    <div class="settings-panel">
      <div class="field">
        <label>Server URL</label>
        <input type="text" id="server-url" value="${escapeHtml(serverUrlInput)}" />
      </div>
      <div class="field">
        <label>Email</label>
        <input type="text" id="user-email" value="${escapeHtml(userEmail)}" placeholder="your@email.com" />
      </div>
    </div>
  `;
}

function renderCacheStatus(): string {
  if (!cacheStatus) return "";
  const lastSync = cacheStatus.lastSyncAt
    ? new Date(cacheStatus.lastSyncAt).toLocaleString("ko-KR", { hour12: false })
    : "없음";
  return `
    <div class="cache-status">
      캐시 <strong>${cacheStatus.totalKeys.toLocaleString()}</strong>개 키 · 마지막 갱신: ${lastSync}
    </div>
  `;
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
      <div class="node-item-header">
        <span class="badge badge-${result.status}">${statusLabel(result.status)}</span>
        ${userAction ? `<span class="action-indicator">✓ ${actionLabel(userAction.action)}</span>` : ""}
      </div>
      <div class="node-text">"${escapeHtml(result.text)}"</div>
      <div class="node-path">${escapeHtml(node?.parentPath ?? "")}</div>

      ${result.existingMapping ? renderExistingMapping(result) : ""}
      ${result.candidates.length > 0 ? renderCandidates(result) : ""}
      ${result.status === "new" || result.status === "candidate" ? renderNewKeyInput(result) : ""}

      <div class="node-actions">
        ${result.status === "candidate" && result.candidates[0]
          ? `<button class="btn btn-sm btn-primary" data-action="link" data-node-id="${result.nodeId}" data-key="${result.candidates[0].keyName}">연결: ${escapeHtml(result.candidates[0].keyName)}</button>`
          : ""}
        ${result.status === "changed"
          ? `<button class="btn btn-sm btn-primary" data-action="update" data-node-id="${result.nodeId}" data-key="${result.existingMapping?.keyName}">Source 업데이트</button>`
          : ""}
        ${result.status !== "matched" && result.status !== "ignored"
          ? `<button class="btn btn-sm btn-secondary" data-action="ignore" data-node-id="${result.nodeId}">무시</button>`
          : ""}
      </div>
    </div>
  `;
}

function renderExistingMapping(result: ScanResultNode): string {
  if (!result.existingMapping) return "";
  return `
    <div class="mapping-info">
      Key: <code>${escapeHtml(result.existingMapping.keyName)}</code>
      ${result.status === "changed"
        ? `<div class="changed-diff">이전: "${escapeHtml(result.existingMapping.previousText ?? "")}" → 현재: "${escapeHtml(result.existingMapping.currentText ?? "")}"</div>`
        : ""}
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
          <span class="candidate-key">${escapeHtml(c.keyName)}</span>
          <div class="candidate-meta">
            <span class="candidate-match-type">${c.matchType}</span>
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
    <div class="key-input-group">
      <input class="key-input" type="text" placeholder="domain.section.element.modifier" value="${escapeHtml(currentKey)}" data-key-input="${result.nodeId}" />
      <button class="btn btn-sm btn-primary" data-action="create" data-node-id="${result.nodeId}">신규 Key 생성</button>
    </div>
  `;
}

function renderEmpty(message: string) {
  document.getElementById("create-figma-plugin")!.innerHTML = `
    <div class="container">
      ${renderSettingsPanel()}
      ${renderCacheStatus()}
      <div class="toolbar">
        <span class="toolbar-title">i18n Sync</span>
        <div class="toolbar-actions">
          <button class="btn btn-secondary" id="btn-refresh-cache" ${isCacheRefreshing ? "disabled" : ""}>
            ${isCacheRefreshing ? "갱신 중..." : "캐시 갱신"}
          </button>
          <button class="btn btn-primary" id="btn-scan">스캔</button>
        </div>
      </div>
      <div class="state-view">
        <div class="state-icon">🔍</div>
        <div class="state-message">${message}</div>
      </div>
    </div>
  `;
  bindEvents();
}

function renderError(message: string) {
  document.getElementById("create-figma-plugin")!.innerHTML = `
    <div class="container">
      ${renderSettingsPanel()}
      ${renderCacheStatus()}
      <div class="toolbar">
        <span class="toolbar-title">i18n Sync</span>
        <div class="toolbar-actions">
          <button class="btn btn-secondary" id="btn-refresh-cache" ${isCacheRefreshing ? "disabled" : ""}>
            ${isCacheRefreshing ? "갱신 중..." : "캐시 갱신"}
          </button>
          <button class="btn btn-primary" id="btn-scan">스캔</button>
        </div>
      </div>
      <div class="state-view error">
        <div class="state-icon">⚠️</div>
        <div class="state-message">${message}</div>
      </div>
    </div>
  `;
  bindEvents();
}

function setLoading(loading: boolean) {
  isLoading = loading;
  if (loading) {
    document.getElementById("create-figma-plugin")!.innerHTML = `
      <div class="container">
        <div class="state-view">
          <div class="loading-spinner"></div>
          <div class="state-message">처리 중...</div>
        </div>
      </div>
    `;
  }
}

// ─── Event Binding ───
function bindEvents() {
  document.getElementById("server-url")?.addEventListener("change", (e) => {
    serverUrlInput = (e.target as HTMLInputElement).value;
    setServerUrl(serverUrlInput);
  });

  document.getElementById("user-email")?.addEventListener("change", (e) => {
    userEmail = (e.target as HTMLInputElement).value;
  });

  document.getElementById("btn-scan")?.addEventListener("click", () => {
    emit("SCAN");
  });

  document.getElementById("btn-sync")?.addEventListener("click", () => {
    handleSync();
  });

  document.getElementById("btn-refresh-cache")?.addEventListener("click", () => {
    handleRefreshCache();
  });

  document.querySelectorAll("[data-filter]").forEach((el) => {
    el.addEventListener("click", () => {
      activeFilter = (el as HTMLElement).dataset.filter as NodeStatus | "all";
      render();
    });
  });

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

// ─── Helpers ───
function showNotify(message: string) {
  emit("NOTIFY", { message });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusLabel(status: NodeStatus): string {
  const labels: Record<NodeStatus, string> = {
    matched: "Matched",
    candidate: "Candidate",
    new: "New",
    changed: "Changed",
    ignored: "Ignored",
  };
  return labels[status] ?? status;
}

function actionLabel(action: SyncItem["action"]): string {
  const labels: Record<SyncItem["action"], string> = {
    link_existing: "연결 예정",
    create_new: "생성 예정",
    update_source: "업데이트 예정",
    ignore: "무시 예정",
  };
  return labels[action] ?? action;
}

// ─── Initial render ───
renderEmpty("Frame을 선택하고 [스캔] 버튼을 눌러주세요");

getCacheStatus()
  .then((status) => {
    cacheStatus = status;
    if (scanResults.length > 0) {
      render();
    } else {
      renderEmpty("Frame을 선택하고 [스캔] 버튼을 눌러주세요");
    }
  })
  .catch(() => {
    // 서버 연결 전이거나 오프라인 상태일 때 무시
  });
