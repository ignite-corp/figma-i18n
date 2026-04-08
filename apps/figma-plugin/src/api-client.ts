import type {
  ScanRequest,
  ScanResponse,
  SyncRequest,
  SyncResponse,
  CacheStatusResponse,
  KeySearchResponse,
} from "shared-types";

let serverUrl = "http://localhost:3001";

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

/** Key 검색 */
export async function searchKeys(
  query: string,
  limit = 10,
): Promise<KeySearchResponse> {
  return request<KeySearchResponse>(
    `/api/keys/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
}
