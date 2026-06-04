import type {
  ScanRequest,
  ScanResponse,
  SyncRequest,
  SyncResponse,
  CacheStatusResponse,
  CacheRefreshResponse,
  KeySearchResponse,
} from "shared-types";

let serverUrl = "https://sync-server-production-f593.up.railway.app";

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
): Promise<Record<string, string>> {
  const res = await request<{ translations: Record<string, string> }>("/api/translate", {
    method: "POST",
    body: JSON.stringify({ texts }),
  });
  return res.translations;
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
