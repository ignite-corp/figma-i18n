import type {
  ScanRequest,
  ScanResponse,
  SyncRequest,
  SyncResponse,
  CacheStatusResponse,
  CacheRefreshResponse,
  KeySearchResponse,
  KeyFindResponse,
  KeyLookupRequest,
  KeyLookupResponse,
  KeyUpdateRequest,
  KeyUpdateResponse,
  BulkKeysRequest,
  BulkKeysResponse,
} from "shared-types";

let serverUrl = "https://figma-i18n.onrender.com";

export function setServerUrl(url: string) {
  serverUrl = url.replace(/\/+$/, "");
}

export function getServerUrl() {
  return serverUrl;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const res = await fetch(`${serverUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Server error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

/** 텍스트 노드 스캔 요청 → 매칭 결과 수신 */
export async function scanNodes(body: ScanRequest): Promise<ScanResponse> {
  return request<ScanResponse>("/api/scan", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 승인된 항목 동기화 요청 */
export async function syncItems(body: SyncRequest): Promise<SyncResponse> {
  return request<SyncResponse>("/api/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 캐시 상태 조회 */
export async function getCacheStatus(): Promise<CacheStatusResponse> {
  return request<CacheStatusResponse>("/api/cache/status");
}

/** 캐시 강제 갱신 */
export async function refreshCache(projectId?: string): Promise<CacheRefreshResponse> {
  return request<CacheRefreshResponse>("/api/cache/refresh", {
    method: "POST",
    body: JSON.stringify(projectId ? { projectId } : {}),
  });
}

/** EN → FR 번역 (sync-server 경유) */
export async function translateFr(
  texts: Record<string, string>,
): Promise<{ translations: Record<string, string>; hasErrors: boolean }> {
  const res = await request<{ translations: Record<string, string>; hasErrors: boolean }>("/api/translate", {
    method: "POST",
    body: JSON.stringify({ texts }),
  });
  return { translations: res.translations, hasErrors: res.hasErrors ?? false };
}

/** Key 검색 */
export async function searchKeys(
  query: string,
  limit = 10,
): Promise<KeySearchResponse> {
  return request<KeySearchResponse>(
    `/api/keys/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
}

/** key 이름 / value 부분 일치 검색 */
export async function findKeys(
  query: string,
  projectId: string,
  limit = 30,
): Promise<KeyFindResponse> {
  return request<KeyFindResponse>(
    `/api/keys/find?q=${encodeURIComponent(query)}&limit=${limit}&projectId=${encodeURIComponent(projectId)}`,
  );
}

/** key 이름 목록으로 존재 여부/현재 값 조회 */
export async function lookupKeys(body: KeyLookupRequest): Promise<KeyLookupResponse> {
  return request<KeyLookupResponse>("/api/keys/lookup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 단일 key value 업데이트 */
export async function updateKeyValue(body: KeyUpdateRequest): Promise<KeyUpdateResponse> {
  return request<KeyUpdateResponse>("/api/keys/update", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** JSON 대량 생성/업데이트 */
export async function bulkUpsertKeys(body: BulkKeysRequest): Promise<BulkKeysResponse> {
  return request<BulkKeysResponse>("/api/keys/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
