import { on, emit } from "@create-figma-plugin/utilities";
import { VERSION } from "./version";
import type {
  ExtractedNode,
  ScanResultNode,
  NodeStatus,
  SyncItem,
  I18nPluginData,
  CacheStatusResponse,
  KeyEntry,
  BulkKeyItem,
  BulkKeyResult,
} from "shared-types";
import {
  scanNodes,
  syncItems,
  getCacheStatus,
  refreshCache,
  translateFr,
  findKeys,
  lookupKeys,
  updateKeyValue,
  bulkUpsertKeys,
} from "./api-client";
import "!./ui.css";

// ─── State ───
type Tab = "scan" | "keys" | "bulk";

let activeTab: Tab = "scan";
let figmaFileKey = "";
let extractedNodes: ExtractedNode[] = [];
let scanResults: ScanResultNode[] = [];
let activeFilter: NodeStatus | "all" = "all";
let isLoading = false;
let isSyncing = false;
let cacheStatus: CacheStatusResponse | null = null;
let isCacheRefreshing = false;

// 스캔 탭의 빈 상태 / 에러 안내
let scanNotice: { kind: "empty" | "error"; message: string } | null = {
  kind: "empty",
  message: "Frame을 선택하고 [스캔] 버튼을 눌러주세요",
};

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

// ─── Key 검색 탭 state ───
let keyQuery = "";
let keyResults: KeyEntry[] = [];
let keyTotal = 0;
let keySearched = false;
let isKeySearching = false;
let savingKeyName: string | null = null;
// 사용자가 수정 중인 값 (keyName → 저장 형식 value)
const keyEdits: Map<string, string> = new Map();
// Lokalise에서 이미 변경되어 저장이 보류된 key
const keyConflicts: Set<string> = new Set();

// ─── JSON 대량 추가 탭 state ───
type BulkStatus = "new" | "changed" | "same";
interface BulkEntry {
  keyName: string;
  value: string;
  status: BulkStatus;
  currentValue: string | null;
}

let bulkJson = "";
let bulkError = "";
let bulkEntries: BulkEntry[] = [];
let bulkChecked: Set<string> = new Set();
let bulkResults: BulkKeyResult[] = [];
let isBulkChecking = false;
let isBulkApplying = false;

const ANNOTATION_CATEGORY_IDS = ["14539:0", "12208:0"];

// Lokalise 프로젝트 선택 (FO / BO)
let selectedProject: "dealer-fo" | "dealer-bo" = "dealer-fo";

const HCHAT_FR_LOCALES = ["fr", "fr_CA"];

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

on("APPLY_TEXTS_DONE", (result: { updated: number; failed: number; notFound: string[] }) => {
  if (result.updated === 0 && result.failed === 0) return;
  const parts = [`Figma 텍스트 ${result.updated}개 반영`];
  if (result.failed > 0) parts.push(`${result.failed}개 실패`);
  showNotify(parts.join(", "));
});

// ─── Scan logic ───
async function handleScanResult() {
  if (extractedNodes.length === 0) {
    scanResults = [];
    scanNotice = { kind: "empty", message: "선택된 영역에 텍스트 노드가 없습니다" };
    render();
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
    scanNotice = null;
    userActions.clear();
    userValues.clear();
    checkedNodes.clear();
  } catch (err) {
    scanNotice = {
      kind: "error",
      message: `서버 연결 실패: ${err instanceof Error ? err.message : err}`,
    };
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

// ─── FR 번역 (sync-server → LibreTranslate 경유) ───
async function callTranslateFr(texts: Record<string, string>): Promise<Record<string, string>> {
  try {
    const result = await translateFr(texts);
    if (result.hasErrors) {
      showNotify("일부 텍스트 FR 번역 실패 — 원문으로 동기화합니다.");
    }
    return result.translations;
  } catch {
    showNotify("FR 번역 실패 — 원문으로 동기화합니다.");
    return texts;
  }
}

// ─── Sync logic ───
async function handleSync() {
  if (isSyncing) return;
  isSyncing = true;
  render();
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
    isSyncing = false;
    return;
  }

  // H Chat EN→FR 번역 (sync-server 경유)
  const toTranslate: Record<string, string> = {};
  for (const item of items) {
    if (item.action === "create_new" || item.action === "update_source") {
      toTranslate[item.nodeId] = item.value ?? item.text;
    }
  }
  if (Object.keys(toTranslate).length > 0) {
    const translated = await callTranslateFr(toTranslate);
    for (const item of items) {
      const frText = translated[item.nodeId];
      if (frText && frText !== (item.value ?? item.text)) {
        item.frTranslations = Object.fromEntries(HCHAT_FR_LOCALES.map((l) => [l, frText]));
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

    // value를 직접 수정한 항목은 Figma 텍스트도 같은 값으로 맞춘다
    const appliedTexts = response.results
      .filter(
        (item) =>
          item.success &&
          item.action !== "delete_key" &&
          item.action !== "ignore" &&
          userValues.has(item.nodeId),
      )
      .map((item) => ({
        nodeId: item.nodeId,
        value: toDisplayValue(userValues.get(item.nodeId)!),
      }));
    if (appliedTexts.length > 0) emit("APPLY_NODE_TEXTS", appliedTexts);

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
  } catch (err) {
    showNotify(`동기화 실패: ${err instanceof Error ? err.message : err}`);
  } finally {
    isSyncing = false;
    setLoading(false);
  }
}

// ─── Key 검색 / 수정 logic ───
async function handleKeySearch() {
  const query = keyQuery.trim();
  if (!query) {
    showNotify("검색어를 입력해주세요.");
    return;
  }
  if (isKeySearching) return;

  isKeySearching = true;
  keyEdits.clear();
  keyConflicts.clear();
  render();

  try {
    const response = await findKeys(query, selectedProject);
    keyResults = response.results;
    keyTotal = response.total;
    keySearched = true;
  } catch (err) {
    keyResults = [];
    keyTotal = 0;
    keySearched = true;
    showNotify(`검색 실패: ${err instanceof Error ? err.message : err}`);
  } finally {
    isKeySearching = false;
    render();
  }
}

async function handleKeySave(keyName: string, rawValue: string, force = false) {
  if (savingKeyName) return;

  const value = toStoredValue(rawValue);
  const target = keyResults.find((k) => k.keyName === keyName);
  if (target && target.baseValue === value) {
    showNotify("변경된 내용이 없습니다.");
    return;
  }

  savingKeyName = keyName;
  render();

  try {
    const response = await updateKeyValue({
      keyName,
      value,
      projectId: selectedProject,
      figmaFileId: figmaFileKey || undefined,
      triggeredBy: "plugin",
      expectedValue: target?.baseValue,
      force,
    });

    // 서버가 반환한 값으로 갱신 (conflict면 Lokalise 최신 값)
    keyResults = keyResults.map((k) => (k.keyName === keyName ? response.key : k));

    if (response.status === "conflict") {
      // 사용자가 입력하던 내용은 유지한 채 최신 값을 보여주고 재확인 받는다
      keyEdits.set(keyName, value);
      keyConflicts.add(keyName);
      showNotify(`${keyName}: Lokalise에서 이미 수정된 key입니다. 최신 값을 확인해주세요.`);
    } else {
      keyEdits.delete(keyName);
      keyConflicts.delete(keyName);
      showNotify(`업데이트 완료: ${keyName}`);
      // 이 key에 연결된 현재 페이지의 텍스트 노드도 함께 갱신
      emit("APPLY_TEXTS", [{ keyName, value: toDisplayValue(value) }]);
    }
  } catch (err) {
    showNotify(`업데이트 실패: ${err instanceof Error ? err.message : err}`);
  } finally {
    savingKeyName = null;
    render();
  }
}

// ─── JSON 대량 추가 logic ───
/** JSON 텍스트를 { key: value } 로 파싱. 오류 메시지를 반환하면 실패 */
function parseBulkJson(text: string): { entries: Array<[string, string]> } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { error: `JSON 파싱 실패: ${err instanceof Error ? err.message : err}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: '최상위가 { "KEY": "값" } 형태의 객체여야 합니다.' };
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return { error: "항목이 비어 있습니다." };

  const invalid = entries.filter(([, v]) => typeof v !== "string").map(([k]) => k);
  if (invalid.length > 0) {
    return {
      error: `값이 문자열이 아닌 키가 있습니다 (중첩 객체 미지원): ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? ` 외 ${invalid.length - 5}개` : ""}`,
    };
  }

  return { entries: entries as Array<[string, string]> };
}

async function handleBulkCheck() {
  if (isBulkChecking) return;

  const parsed = parseBulkJson(bulkJson.trim());
  if ("error" in parsed) {
    bulkError = parsed.error;
    bulkEntries = [];
    bulkChecked.clear();
    bulkResults = [];
    render();
    return;
  }

  bulkError = "";
  bulkResults = [];
  isBulkChecking = true;
  render();

  try {
    const response = await lookupKeys({
      keyNames: parsed.entries.map(([k]) => k),
      projectId: selectedProject,
    });
    const existing = new Map(response.found.map((k) => [k.keyName, k.baseValue]));

    bulkEntries = parsed.entries.map(([keyName, rawValue]) => {
      const value = toStoredValue(rawValue);
      const currentValue = existing.has(keyName) ? existing.get(keyName)! : null;
      const status: BulkStatus =
        currentValue === null ? "new" : currentValue === value ? "same" : "changed";
      return { keyName, value, status, currentValue };
    });

    bulkChecked = new Set(
      bulkEntries.filter((e) => e.status !== "same").map((e) => e.keyName),
    );
  } catch (err) {
    bulkError = `조회 실패: ${err instanceof Error ? err.message : err}`;
    bulkEntries = [];
    bulkChecked.clear();
  } finally {
    isBulkChecking = false;
    render();
  }
}

async function handleBulkApply() {
  if (isBulkApplying) return;

  const items: BulkKeyItem[] = bulkEntries
    .filter((e) => e.status !== "same" && bulkChecked.has(e.keyName))
    .map((e) => ({
      keyName: e.keyName,
      value: e.value,
      mode: e.status === "new" ? "create" : "update",
      // 미리보기 시점에 확인한 값 — 그 사이 Lokalise가 바뀌었으면 서버가 건너뛴다
      expectedValue: e.currentValue ?? undefined,
    }));

  if (items.length === 0) {
    showNotify("반영할 항목이 없습니다. 체크된 항목을 확인해주세요.");
    return;
  }

  isBulkApplying = true;
  render();

  try {
    const response = await bulkUpsertKeys({
      items,
      projectId: selectedProject,
      figmaFileId: figmaFileKey || undefined,
      triggeredBy: "plugin",
    });

    bulkResults = response.results;
    const succeeded = new Set(
      response.results.filter((r) => r.success).map((r) => r.keyName),
    );

    // 성공한 항목은 반영 완료 상태로 전환
    const appliedTexts = bulkEntries
      .filter((e) => succeeded.has(e.keyName))
      .map((e) => ({ keyName: e.keyName, value: toDisplayValue(e.value) }));

    bulkEntries = bulkEntries.map((e) =>
      succeeded.has(e.keyName)
        ? { ...e, status: "same", currentValue: e.value }
        : e,
    );
    succeeded.forEach((keyName) => bulkChecked.delete(keyName));

    // 연결된 현재 페이지의 텍스트 노드도 함께 갱신
    if (appliedTexts.length > 0) emit("APPLY_TEXTS", appliedTexts);

    showNotify(
      `반영 완료: ${response.summary.succeeded}건 성공, ${response.summary.failed}건 실패`,
    );
  } catch (err) {
    showNotify(`반영 실패: ${err instanceof Error ? err.message : err}`);
  } finally {
    isBulkApplying = false;
    render();
  }
}

// ─── Rendering ───
function render() {
  const root = document.getElementById("create-figma-plugin")!;
  const scrollTop = document.querySelector(".node-list")?.scrollTop ?? 0;

  root.innerHTML = `
    <div class="container">
      ${renderProjectSelector()}
      ${renderCacheStatus()}

      <div class="toolbar">
        <span class="toolbar-title">i18n Sync <span class="toolbar-version">v${VERSION}</span></span>
        <div class="toolbar-actions">
          <button class="btn btn-secondary" id="btn-refresh-cache" ${isCacheRefreshing ? "disabled" : ""}>
            ${isCacheRefreshing ? "갱신 중..." : "캐시 갱신"}
          </button>
        </div>
      </div>

      ${renderTabs()}

      ${activeTab === "scan" ? renderScanTab() : ""}
      ${activeTab === "keys" ? renderKeysTab() : ""}
      ${activeTab === "bulk" ? renderBulkTab() : ""}
    </div>
  `;

  const nodeList = document.querySelector(".node-list");
  if (nodeList) nodeList.scrollTop = scrollTop;

  bindEvents();
}

function renderTabs(): string {
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "scan", label: "스캔" },
    { key: "keys", label: "키 검색" },
    { key: "bulk", label: "JSON 추가" },
  ];

  return `
    <div class="tab-bar">
      ${tabs
        .map(
          (t) =>
            `<button class="tab ${activeTab === t.key ? "active" : ""}" data-tab="${t.key}">${t.label}</button>`,
        )
        .join("")}
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

// ─── 스캔 탭 ───
function renderScanTab(): string {
  const checkedCount = checkedNodes.size;

  const actions = `
    <div class="tab-actions">
      <button class="btn btn-secondary" id="btn-scan">스캔</button>
      <div class="tab-actions-spacer"></div>
      <button class="btn btn-primary" id="btn-sync" ${checkedCount === 0 || isSyncing ? "disabled" : ""}>
        동기화${checkedCount > 0 ? ` (${checkedCount})` : ""}
      </button>
    </div>
  `;

  if (isLoading) return `${actions}${renderStateView("", "처리 중...", true)}`;
  if (scanNotice) {
    return `${actions}${renderStateView(
      scanNotice.kind === "error" ? "⚠️" : "🔍",
      scanNotice.message,
      false,
      scanNotice.kind === "error",
    )}`;
  }

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

  return `
    ${actions}

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
            <textarea class="value-input" data-value-input="${result.nodeId}" placeholder="번역 텍스트" rows="2">${escapeHtml(toDisplayValue(currentValue))}</textarea>
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
      <input class="key-input" type="text" placeholder="DOMAIN_SECTION_ELEMENT_MODIFIER" value="${escapeHtml(currentKey)}" data-key-input="${result.nodeId}" />
    </div>
    <div class="value-input-group">
      <label class="value-label">Value</label>
      <textarea class="value-input" data-value-input="${result.nodeId}" placeholder="번역 텍스트" rows="2">${escapeHtml(toDisplayValue(currentValue))}</textarea>
    </div>
  `;
}

// ─── 키 검색 탭 ───
function renderKeysTab(): string {
  const search = `
    <div class="search-bar">
      <div class="settings-row">
        <input class="search-input" type="text" id="key-search-input"
          placeholder="key 이름 또는 값으로 검색 (Enter)" value="${escapeHtml(keyQuery)}" />
        <button class="btn btn-primary" id="btn-key-search" ${isKeySearching ? "disabled" : ""}>
          ${isKeySearching ? "검색 중..." : "검색"}
        </button>
      </div>
    </div>
  `;

  if (isKeySearching) return `${search}${renderStateView("", "검색 중...", true)}`;

  if (!keySearched) {
    return `${search}${renderStateView("🔑", "Lokalise에 등록된 key를 이름이나 값으로 검색해 바로 수정할 수 있습니다")}`;
  }

  if (keyResults.length === 0) {
    return `${search}${renderStateView("🔍", `"${keyQuery}" 검색 결과가 없습니다`)}`;
  }

  const truncated = keyTotal > keyResults.length;

  return `
    ${search}
    <div class="result-summary">
      ${keyResults.length.toLocaleString()}개 표시${truncated ? ` · 전체 ${keyTotal.toLocaleString()}개 (검색어를 더 구체적으로 입력하세요)` : ""}
    </div>
    <div class="node-list">
      ${keyResults.map((k) => renderKeyItem(k)).join("")}
    </div>
  `;
}

function renderKeyItem(key: KeyEntry): string {
  const saving = savingKeyName === key.keyName;
  const conflict = keyConflicts.has(key.keyName);
  const edited = keyEdits.get(key.keyName);
  const value = edited !== undefined ? edited : key.baseValue;

  return `
    <div class="node-item ${conflict ? "node-item--conflict" : ""}" data-key-item="${escapeHtml(key.keyName)}">
      <div class="node-item-header">
        <code class="key-name">${escapeHtml(key.keyName)}</code>
        <button class="btn btn-sm ${conflict ? "btn-danger" : "btn-primary"}" data-action="save-key"
          ${conflict ? 'data-force="1"' : ""} ${savingKeyName ? "disabled" : ""}>
          ${saving ? "저장 중..." : conflict ? "덮어쓰기" : "저장"}
        </button>
      </div>
      ${conflict
        ? `<div class="conflict-notice">
            ⚠️ Lokalise에서 이미 수정된 key입니다. 저장하지 않았습니다.
            <div class="conflict-current">최신 값: "${escapeHtml(toDisplayValue(key.baseValue))}"</div>
            <button class="btn btn-sm btn-ghost" data-action="use-latest">최신 값 가져오기</button>
          </div>`
        : ""}
      <div class="value-input-group">
        <textarea class="value-input" data-key-value placeholder="번역 텍스트" rows="2">${escapeHtml(toDisplayValue(value))}</textarea>
      </div>
    </div>
  `;
}

// ─── JSON 대량 추가 탭 ───
function renderBulkTab(): string {
  const counts = {
    new: bulkEntries.filter((e) => e.status === "new").length,
    changed: bulkEntries.filter((e) => e.status === "changed").length,
    same: bulkEntries.filter((e) => e.status === "same").length,
  };
  const selectable = bulkEntries.filter((e) => e.status !== "same").length;
  const checkedCount = bulkChecked.size;

  const editor = `
    <div class="bulk-editor">
      <label class="settings-label">{ "KEY": "값" } 형태의 JSON을 붙여넣으세요</label>
      <textarea class="bulk-input" id="bulk-input" rows="6" placeholder='{\n  "HOME_MAIN_TITLE": "안녕하세요",\n  "HOME_MAIN_BUTTON_EDIT": "수정"\n}'>${escapeHtml(bulkJson)}</textarea>
      ${bulkError ? `<div class="bulk-error">${escapeHtml(bulkError)}</div>` : ""}
      <div class="tab-actions">
        <button class="btn btn-secondary" id="btn-bulk-check" ${isBulkChecking ? "disabled" : ""}>
          ${isBulkChecking ? "확인 중..." : "미리보기"}
        </button>
        <div class="tab-actions-spacer"></div>
        <button class="btn btn-primary" id="btn-bulk-apply" ${checkedCount === 0 || isBulkApplying ? "disabled" : ""}>
          반영${checkedCount > 0 ? ` (${checkedCount})` : ""}
        </button>
      </div>
    </div>
  `;

  if (isBulkChecking || isBulkApplying) {
    return `${editor}${renderStateView("", isBulkApplying ? "반영 중..." : "확인 중...", true)}`;
  }

  if (bulkEntries.length === 0) {
    return `${editor}${renderStateView("📋", "JSON을 붙여넣고 [미리보기]를 누르면 신규 / 변경 / 동일로 분류합니다")}`;
  }

  return `
    ${editor}
    <div class="result-summary">
      신규 <strong>${counts.new}</strong> · 변경 <strong>${counts.changed}</strong> · 동일 <strong>${counts.same}</strong>
      ${selectable > 0 ? `<span class="group-select-divider"></span>
        <button class="btn btn-sm btn-ghost" id="btn-bulk-select-all">전체 선택</button>
        <button class="btn btn-sm btn-ghost" id="btn-bulk-deselect-all">선택 해제</button>` : ""}
    </div>
    <div class="node-list">
      ${bulkEntries.map((e, i) => renderBulkItem(e, i)).join("")}
    </div>
  `;
}

function renderBulkItem(entry: BulkEntry, index: number): string {
  const checkable = entry.status !== "same";
  const checked = bulkChecked.has(entry.keyName);
  const failure = bulkResults.find((r) => r.keyName === entry.keyName && !r.success);

  const badgeClass =
    entry.status === "new" ? "badge-new" : entry.status === "changed" ? "badge-changed" : "badge-matched";
  const badgeLabel =
    entry.status === "new" ? "New" : entry.status === "changed" ? "Changed" : "Same";

  return `
    <div class="node-item ${checked ? "node-item--checked" : ""}">
      <div class="node-item-header">
        <label class="checkbox-label">
          <input type="checkbox" class="node-checkbox" data-bulk-index="${index}"
            ${checked ? "checked" : ""} ${!checkable ? "disabled" : ""} />
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </label>
      </div>
      <code class="key-name">${escapeHtml(entry.keyName)}</code>
      <div class="bulk-value">${escapeHtml(toDisplayValue(entry.value))}</div>
      ${entry.status === "changed"
        ? `<div class="changed-diff">기존: "${escapeHtml(toDisplayValue(entry.currentValue ?? ""))}"</div>`
        : ""}
      ${failure ? `<div class="bulk-error">실패: ${escapeHtml(failure.error ?? "알 수 없는 오류")}</div>` : ""}
    </div>
  `;
}

// ─── 공통 상태 뷰 ───
function renderStateView(icon: string, message: string, spinner = false, isError = false): string {
  return `
    <div class="state-view ${isError ? "error" : ""}">
      ${spinner ? `<div class="loading-spinner"></div>` : `<div class="state-icon">${icon}</div>`}
      <div class="state-message">${escapeHtml(message)}</div>
    </div>
  `;
}

function setLoading(loading: boolean) {
  isLoading = loading;
  render();
}

// ─── Event Binding ───
function bindEvents() {
  document.querySelectorAll("[data-project]").forEach((el) => {
    el.addEventListener("click", () => {
      selectedProject = (el as HTMLElement).dataset.project as "dealer-fo" | "dealer-bo";
      render();
    });
  });

  document.querySelectorAll("[data-tab]").forEach((el) => {
    el.addEventListener("click", () => {
      activeTab = (el as HTMLElement).dataset.tab as Tab;
      render();
    });
  });

  document.getElementById("btn-refresh-cache")?.addEventListener("click", () => {
    handleRefreshCache();
  });

  if (activeTab === "scan") bindScanEvents();
  if (activeTab === "keys") bindKeysEvents();
  if (activeTab === "bulk") bindBulkEvents();
}

function bindScanEvents() {
  document.getElementById("btn-scan")?.addEventListener("click", () => {
    emit("SCAN", { annotationCategoryIds: ANNOTATION_CATEGORY_IDS });
  });

  document.getElementById("btn-sync")?.addEventListener("click", () => {
    handleSync();
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
  document.querySelectorAll("[data-check-node]").forEach((el) => {
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

  // Key 이름 인풋 — 입력 즉시 userActions에 저장 (render() 시 초기화 방지)
  document.querySelectorAll("[data-key-input]").forEach((el) => {
    el.addEventListener("input", (e) => {
      const nodeId = (el as HTMLElement).dataset.keyInput!;
      const keyName = (e.target as HTMLInputElement).value;
      userActions.set(nodeId, { action: "create_new", keyName });
    });
  });

  // Value 수정 인풋 (실제 개행 → \n 리터럴로 저장)
  document.querySelectorAll("[data-value-input]").forEach((el) => {
    el.addEventListener("input", (e) => {
      const nodeId = (el as HTMLElement).dataset.valueInput!;
      userValues.set(nodeId, toStoredValue((e.target as HTMLInputElement).value));
    });
  });
}

function bindKeysEvents() {
  const input = document.getElementById("key-search-input") as HTMLInputElement | null;
  // 입력 중에는 렌더하지 않고 state만 갱신 (포커스 유지)
  input?.addEventListener("input", (e) => {
    keyQuery = (e.target as HTMLInputElement).value;
  });
  input?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") handleKeySearch();
  });

  document.getElementById("btn-key-search")?.addEventListener("click", () => {
    handleKeySearch();
  });

  // 입력 중에는 렌더하지 않고 state만 갱신 (다른 행 저장 시 입력 내용 유실 방지)
  document.querySelectorAll("[data-key-value]").forEach((el) => {
    el.addEventListener("input", (e) => {
      const item = (el as HTMLElement).closest("[data-key-item]") as HTMLElement | null;
      if (!item) return;
      keyEdits.set(item.dataset.keyItem!, toStoredValue((e.target as HTMLTextAreaElement).value));
    });
  });

  document.querySelectorAll("[data-action='save-key']").forEach((el) => {
    el.addEventListener("click", () => {
      const item = (el as HTMLElement).closest("[data-key-item]") as HTMLElement | null;
      const textarea = item?.querySelector("[data-key-value]") as HTMLTextAreaElement | null;
      if (!item || !textarea) return;
      handleKeySave(item.dataset.keyItem!, textarea.value, (el as HTMLElement).dataset.force === "1");
    });
  });

  // 충돌 시 내 수정 내용을 버리고 Lokalise 최신 값으로 되돌리기
  document.querySelectorAll("[data-action='use-latest']").forEach((el) => {
    el.addEventListener("click", () => {
      const item = (el as HTMLElement).closest("[data-key-item]") as HTMLElement | null;
      if (!item) return;
      const keyName = item.dataset.keyItem!;
      keyEdits.delete(keyName);
      keyConflicts.delete(keyName);
      render();
    });
  });
}

function bindBulkEvents() {
  // 입력 중에는 렌더하지 않고 state만 갱신 (포커스 유지)
  document.getElementById("bulk-input")?.addEventListener("input", (e) => {
    bulkJson = (e.target as HTMLTextAreaElement).value;
  });

  document.getElementById("btn-bulk-check")?.addEventListener("click", () => {
    handleBulkCheck();
  });

  document.getElementById("btn-bulk-apply")?.addEventListener("click", () => {
    handleBulkApply();
  });

  document.getElementById("btn-bulk-select-all")?.addEventListener("click", () => {
    bulkChecked = new Set(
      bulkEntries.filter((e) => e.status !== "same").map((e) => e.keyName),
    );
    render();
  });

  document.getElementById("btn-bulk-deselect-all")?.addEventListener("click", () => {
    bulkChecked.clear();
    render();
  });

  document.querySelectorAll("[data-bulk-index]").forEach((el) => {
    el.addEventListener("change", () => {
      const entry = bulkEntries[Number((el as HTMLElement).dataset.bulkIndex)];
      if (!entry) return;
      if ((el as HTMLInputElement).checked) {
        bulkChecked.add(entry.keyName);
      } else {
        bulkChecked.delete(entry.keyName);
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

/** 저장된 `\n` 리터럴을 실제 개행으로 (표시용) */
function toDisplayValue(value: string): string {
  return value.replace(/\\n/g, "\n");
}

/** 실제 개행을 `\n` 리터럴로 (저장용) */
function toStoredValue(value: string): string {
  return value.replace(/\n/g, "\\n");
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
render();

getCacheStatus()
  .then((status) => {
    cacheStatus = status;
    render();
  })
  .catch(() => {
    // 서버 연결 전이거나 오프라인 상태일 때 무시
  });
