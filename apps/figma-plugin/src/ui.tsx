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
} from "./api-client";
import "!./ui.css";

// ─── State ───
let figmaFileKey = "";
let extractedNodes: ExtractedNode[] = [];
let scanResults: ScanResultNode[] = [];
let activeFilter: NodeStatus | "all" = "all";
let isLoading = false;
let cacheStatus: CacheStatusResponse | null = null;
let isCacheRefreshing = false;

// 사용자가 선택한 action 저장
const userActions: Map<
  string,
  { action: SyncItem["action"]; keyName?: string }
> = new Map();

// 사용자가 직접 수정한 value 저장
const userValues: Map<string, string> = new Map();

// 체크박스 선택 상태
const checkedNodes: Set<string> = new Set();

// 검색 쿼리
let searchQuery = "";

const ANNOTATION_CATEGORY_IDS = ["14539:0", "12208:0"];

// Lokalise 프로젝트 선택 (FO / BO)
let selectedProject: "dealer-fo" | "dealer-bo" = "dealer-fo";

// H Chat 설정
const HCHAT_ENDPOINT = "https://internal-apigw-kr.hmg-corp.io/hchat-in/api/v3/openai/responses";
const HCHAT_FR_LOCALES = ["fr", "fr_CA"];
let hChatApiKey: string = localStorage.getItem("hchat_api_key") ?? "";
let showSettings = false;

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
      projectId: selectedProject,
    });

    scanResults = response.results;
    userActions.clear();
    userValues.clear();
    checkedNodes.clear();
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

// ─── Checkbox helpers ───
function isCheckable(status: NodeStatus): boolean {
  return status !== "ignored";
}

function resolveAction(result: ScanResultNode): { action: SyncItem["action"]; keyName?: string } | null {
  // userActions에 명시적으로 지정된 action이 있으면 우선
  const explicit = userActions.get(result.nodeId);
  if (explicit) return explicit;

  // status 기반 자동 추론
  switch (result.status) {
    case "candidate":
      if (result.candidates[0]) {
        return { action: "link_existing", keyName: result.candidates[0].keyName };
      }
      return null;
    case "new": {
      const input = document.querySelector(`[data-key-input="${result.nodeId}"]`) as HTMLInputElement | null;
      const keyName = input?.value?.trim() || result.suggestedKey || "";
      if (!keyName) return null;
      return { action: "create_new", keyName };
    }
    case "changed":
      return { action: "update_source", keyName: result.existingMapping?.keyName };
    default:
      return null;
  }
}

function toggleCheckGroup(status: NodeStatus | "all", checked: boolean) {
  for (const result of scanResults) {
    if (!isCheckable(result.status)) continue;
    if (status !== "all" && result.status !== status) continue;
    if (checked) {
      checkedNodes.add(result.nodeId);
    } else {
      checkedNodes.delete(result.nodeId);
    }
  }
  render();
}

// ─── H Chat 번역 ───
async function translateToFr(texts: Record<string, string>): Promise<Record<string, string>> {
  const body = {
    model: "gpt-5.4",
    instructions:
      "You are a professional software localization translator. Translate the input JSON values from English to French. " +
      "Preserve the exact JSON structure and all keys. Translate only string values intended for users. " +
      "Do not translate keys, variable names, placeholders, HTML tags, ICU message syntax, URLs, or code snippets. " +
      "Keep newline characters, escape sequences, punctuation, and spacing consistent. Return valid JSON only.",
    input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(texts) }] }],
    text: { format: { type: "text" }, verbosity: "medium" },
    temperature: 0.2,
    max_output_tokens: 4000,
    stream: false,
    truncation: "auto",
  };

  try {
    const res = await fetch(HCHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${hChatApiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      showNotify(`H Chat 번역 실패 (${res.status}) — 원문으로 동기화합니다.`);
      return texts;
    }
    const data = await res.json() as { output?: Array<{ content?: Array<{ text?: string }> }> };
    const rawText = data?.output?.[0]?.content?.[0]?.text ?? "";
    const translated = JSON.parse(rawText) as Record<string, string>;
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(texts)) {
      result[k] = typeof translated[k] === "string" ? translated[k] : v;
    }
    return result;
  } catch {
    showNotify("H Chat 번역 오류 — 원문으로 동기화합니다.");
    return texts;
  }
}

// ─── Sync logic ───
async function handleSync() {
  const items: SyncItem[] = [];
  const pluginDataUpdates: Array<{ nodeId: string; data: I18nPluginData }> = [];

  for (const result of scanResults) {
    if (!checkedNodes.has(result.nodeId)) continue;

    const resolved = resolveAction(result);
    if (!resolved) continue;

    const editedValue = userValues.get(result.nodeId);
    items.push({
      nodeId: result.nodeId,
      action: resolved.action,
      keyName: resolved.keyName,
      text: result.text,
      previousText: result.existingMapping?.previousText,
      value: editedValue !== undefined ? editedValue : undefined,
    });

    if (resolved.action !== "ignore" && resolved.action !== "delete_key" && resolved.keyName) {
      pluginDataUpdates.push({
        nodeId: result.nodeId,
        data: {
          key: resolved.keyName,
          status: "matched",
          sourceText: editedValue !== undefined ? editedValue : result.text,
          linkedAt: new Date().toISOString(),
          syncedAt: new Date().toISOString(),
        },
      });
    }
  }

  if (items.length === 0) {
    showNotify("동기화할 항목이 없습니다. 체크된 항목을 확인해주세요.");
    return;
  }

  // H Chat EN→FR 번역 (VPN 연결 + API Key 있을 때만)
  if (hChatApiKey) {
    const toTranslate: Record<string, string> = {};
    for (const item of items) {
      if (item.action === "create_new" || item.action === "update_source") {
        toTranslate[item.nodeId] = item.value ?? item.text;
      }
    }
    if (Object.keys(toTranslate).length > 0) {
      const translated = await translateToFr(toTranslate);
      for (const item of items) {
        const frText = translated[item.nodeId];
        if (frText) {
          item.frTranslations = Object.fromEntries(HCHAT_FR_LOCALES.map((l) => [l, frText]));
        }
      }
    }
  }

  setLoading(true);

  try {
    const response = await syncItems({
      figmaFileId: figmaFileKey || "unknown",
      triggeredBy: "unknown",
      items,
      projectId: selectedProject,
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
          if (item.action === "delete_key") {
            // 삭제 성공 시 매핑 해제 → new 상태로 전환
            scanResults[idx] = {
              ...scanResults[idx],
              status: "new",
              existingMapping: null,
              suggestedKey: null,
            };
            userActions.delete(item.nodeId);
            checkedNodes.delete(item.nodeId);
            // pluginData 클리어
            emit("SAVE_MAPPING", {
              nodeId: item.nodeId,
              data: { key: "", status: "matched", sourceText: "", linkedAt: "" },
            });
          } else {
            scanResults[idx] = { ...scanResults[idx], status: "matched" };
          }
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

  // 검색 필터링
  const query = searchQuery.toLowerCase();
  const displayed = query
    ? filtered.filter((r) => {
        const keyMatch = r.existingMapping?.keyName?.toLowerCase().includes(query)
          || r.suggestedKey?.toLowerCase().includes(query)
          || userActions.get(r.nodeId)?.keyName?.toLowerCase().includes(query);
        const valueMatch = r.text.toLowerCase().includes(query);
        return keyMatch || valueMatch;
      })
    : filtered;

  const checkedCount = checkedNodes.size;

  root.innerHTML = `
    <div class="container">
      ${renderProjectSelector()}
      ${renderCacheStatus()}

      <div class="toolbar">
        <span class="toolbar-title">i18n Sync</span>
        <div class="toolbar-actions">
          <button class="btn btn-sm btn-ghost" id="btn-settings" title="H Chat 설정">⚙</button>
          <button class="btn btn-secondary" id="btn-scan">스캔</button>
          <button class="btn btn-secondary" id="btn-refresh-cache" ${isCacheRefreshing ? "disabled" : ""}>
            ${isCacheRefreshing ? "갱신 중..." : "캐시 갱신"}
          </button>
          <button class="btn btn-primary" id="btn-sync" ${checkedCount === 0 ? "disabled" : ""}>
            동기화${checkedCount > 0 ? ` (${checkedCount})` : ""}
          </button>
        </div>
      </div>

      ${showSettings ? renderSettingsPanel() : ""}

      <div class="filter-bar">
        ${renderFilterChips()}
      </div>

      <div class="search-bar">
        <input class="search-input" type="text" id="search-input" placeholder="key 또는 텍스트 검색..." value="${escapeHtml(searchQuery)}" />
      </div>

      <div class="group-select-bar">
        <button class="btn btn-sm btn-ghost" data-group-select="all">전체 선택</button>
        <button class="btn btn-sm btn-ghost" data-group-select="candidate">후보</button>
        <button class="btn btn-sm btn-ghost" data-group-select="changed">변경</button>
        <button class="btn btn-sm btn-ghost" data-group-select="new">신규</button>
        <span class="group-select-divider"></span>
        <button class="btn btn-sm btn-ghost" data-group-deselect="all">선택 해제</button>
      </div>

      <div class="node-list">
        ${displayed.map((r) => renderNodeItem(r)).join("")}
      </div>
    </div>
  `;

  bindEvents();
}


function renderSettingsPanel(): string {
  return `
    <div class="settings-panel">
      <label class="settings-label">H Chat API Key ${hChatApiKey ? "✓" : "(미설정 — FR 번역 비활성)"}</label>
      <div class="settings-row">
        <input class="settings-input" type="password" id="hchat-api-key" value="${escapeHtml(hChatApiKey)}" placeholder="Bearer token..." />
        <button class="btn btn-sm btn-secondary" id="btn-save-hchat-key">저장</button>
      </div>
    </div>
  `;
}

function renderProjectSelector(): string {
  return `
    <div class="project-selector">
      <span class="project-selector-label">Project</span>
      <div class="project-toggle">
        <button class="project-tab ${selectedProject === "dealer-fo" ? "active" : ""}" data-project="dealer-fo">FO</button>
        <button class="project-tab ${selectedProject === "dealer-bo" ? "active" : ""}" data-project="dealer-bo">BO</button>
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
  const counts: Record<string, number> = {
    all: scanResults.length,
    matched: scanResults.filter((r) => r.status === "matched").length,
    candidate: scanResults.filter((r) => r.status === "candidate").length,
    new: scanResults.filter((r) => r.status === "new").length,
    changed: scanResults.filter((r) => r.status === "changed").length,
    ignored: scanResults.filter((r) => r.status === "ignored").length,
  };

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
        `<button class="filter-chip ${activeFilter === f.key ? "active" : ""}" data-filter="${f.key}">
          ${f.label}${counts[f.key] > 0 ? `<span class="chip-count">${counts[f.key]}</span>` : ""}
        </button>`,
    )
    .join("");
}

function renderNodeItem(result: ScanResultNode): string {
  const node = extractedNodes.find((n) => n.nodeId === result.nodeId);
  const checkable = isCheckable(result.status);
  const checked = checkedNodes.has(result.nodeId);
  const resolved = checked ? resolveAction(result) : null;

  return `
    <div class="node-item ${checked ? "node-item--checked" : ""}" data-node-id="${result.nodeId}">
      <div class="node-item-header">
        <label class="checkbox-label">
          <input type="checkbox" class="node-checkbox" data-check-node="${result.nodeId}"
            ${checked ? "checked" : ""} ${!checkable ? "disabled" : ""} />
          <span class="badge badge-${result.status}">${statusLabel(result.status)}</span>
        </label>
        ${resolved ? `<span class="action-indicator">✓ ${actionLabel(resolved.action)}</span>` : ""}
      </div>
      <div class="node-text">"${escapeHtml(result.text)}"</div>
      <div class="node-path">${escapeHtml(node?.parentPath ?? "")}</div>

      ${result.existingMapping ? renderExistingMapping(result) : ""}
      ${result.candidates.length > 0 ? renderCandidates(result) : ""}
      ${result.status === "new" || result.status === "candidate" ? renderNewKeyInput(result) : ""}
    </div>
  `;
}

function renderExistingMapping(result: ScanResultNode): string {
  if (!result.existingMapping) return "";
  const editedValue = userValues.get(result.nodeId);
  const currentValue = editedValue !== undefined ? editedValue : result.text;
  const isDeleteAction = userActions.get(result.nodeId)?.action === "delete_key";

  return `
    <div class="mapping-info">
      <div class="mapping-key-row">
        Key: <code>${escapeHtml(result.existingMapping.keyName)}</code>
        <button class="btn btn-sm btn-danger" data-action="delete" data-node-id="${result.nodeId}" data-key="${escapeHtml(result.existingMapping.keyName)}">
          ${isDeleteAction ? "삭제 취소" : "삭제"}
        </button>
      </div>
      ${result.status === "changed"
        ? `<div class="changed-diff">이전: "${escapeHtml(result.existingMapping.previousText ?? "")}" → 현재: "${escapeHtml(result.existingMapping.currentText ?? "")}"</div>`
        : ""}
      ${(result.status === "changed" || result.status === "matched") && !isDeleteAction
        ? `<div class="value-input-group">
            <label class="value-label">Value</label>
            <input class="value-input" type="text" value="${escapeHtml(currentValue)}" data-value-input="${result.nodeId}" placeholder="번역 텍스트" />
          </div>`
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
  const editedValue = userValues.get(result.nodeId);
  const currentValue = editedValue !== undefined ? editedValue : result.text;

  return `
    <div class="key-input-group">
      <input class="key-input" type="text" placeholder="domain.section.element.modifier" value="${escapeHtml(currentKey)}" data-key-input="${result.nodeId}" />
    </div>
    <div class="value-input-group">
      <label class="value-label">Value</label>
      <input class="value-input" type="text" value="${escapeHtml(currentValue)}" data-value-input="${result.nodeId}" placeholder="번역 텍스트" />
    </div>
  `;
}

function renderEmpty(message: string) {
  document.getElementById("create-figma-plugin")!.innerHTML = `
    <div class="container">
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
  document.querySelectorAll("[data-project]").forEach((el) => {
    el.addEventListener("click", () => {
      selectedProject = (el as HTMLElement).dataset.project as "dealer-fo" | "dealer-bo";
      render();
    });
  });

  document.getElementById("btn-scan")?.addEventListener("click", () => {
    emit("SCAN", { annotationCategoryIds: ANNOTATION_CATEGORY_IDS });
  });

  document.getElementById("btn-sync")?.addEventListener("click", () => {
    handleSync();
  });

  document.getElementById("btn-refresh-cache")?.addEventListener("click", () => {
    handleRefreshCache();
  });

  document.getElementById("btn-settings")?.addEventListener("click", () => {
    showSettings = !showSettings;
    render();
  });

  document.getElementById("btn-save-hchat-key")?.addEventListener("click", () => {
    const input = document.getElementById("hchat-api-key") as HTMLInputElement | null;
    if (!input) return;
    hChatApiKey = input.value.trim();
    localStorage.setItem("hchat_api_key", hChatApiKey);
    showNotify(hChatApiKey ? "H Chat API Key 저장됨" : "H Chat API Key 삭제됨");
    render();
  });

  document.querySelectorAll("[data-filter]").forEach((el) => {
    el.addEventListener("click", () => {
      activeFilter = (el as HTMLElement).dataset.filter as NodeStatus | "all";
      render();
    });
  });

  // 그룹 선택 버튼
  document.querySelectorAll("[data-group-select]").forEach((el) => {
    el.addEventListener("click", () => {
      const group = (el as HTMLElement).dataset.groupSelect as NodeStatus | "all";
      toggleCheckGroup(group, true);
    });
  });

  document.querySelectorAll("[data-group-deselect]").forEach((el) => {
    el.addEventListener("click", () => {
      toggleCheckGroup("all", false);
    });
  });

  // 개별 체크박스
  document.querySelectorAll(".node-checkbox").forEach((el) => {
    el.addEventListener("change", () => {
      const nodeId = (el as HTMLInputElement).dataset.checkNode!;
      if ((el as HTMLInputElement).checked) {
        checkedNodes.add(nodeId);
      } else {
        checkedNodes.delete(nodeId);
      }
      render();
    });
  });

  // 후보 연결 버튼 (candidate에서 특정 후보 선택)
  document.querySelectorAll("[data-action='link']").forEach((el) => {
    el.addEventListener("click", () => {
      const nodeId = (el as HTMLElement).dataset.nodeId!;
      const key = (el as HTMLElement).dataset.key!;
      userActions.set(nodeId, { action: "link_existing", keyName: key });
      checkedNodes.add(nodeId);
      render();
    });
  });

  // 삭제 버튼 (matched/changed 노드의 키 삭제)
  document.querySelectorAll("[data-action='delete']").forEach((el) => {
    el.addEventListener("click", () => {
      const nodeId = (el as HTMLElement).dataset.nodeId!;
      const key = (el as HTMLElement).dataset.key!;
      const existing = userActions.get(nodeId);
      if (existing?.action === "delete_key") {
        // 이미 삭제 예정이면 취소
        userActions.delete(nodeId);
        checkedNodes.delete(nodeId);
      } else {
        userActions.set(nodeId, { action: "delete_key", keyName: key });
        checkedNodes.add(nodeId);
      }
      render();
    });
  });

  // 검색 인풋
  document.getElementById("search-input")?.addEventListener("input", (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    render();
    // 렌더 후 포커스와 커서 복원
    const input = document.getElementById("search-input") as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  // Value 수정 인풋
  document.querySelectorAll("[data-value-input]").forEach((el) => {
    el.addEventListener("input", (e) => {
      const nodeId = (el as HTMLElement).dataset.valueInput!;
      const value = (e.target as HTMLInputElement).value;
      userValues.set(nodeId, value);
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
    delete_key: "삭제 예정",
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
