import { RateLimiter } from "./rate-limiter";
import type {
  LokaliseKey,
  LokaliseKeyResponse,
  LokaliseKeysResponse,
  LokaliseCreateKeyPayload,
  LokaliseUpdateKeyPayload,
  LokaliseLanguage,
  LokaliseLanguagesResponse,
} from "./types";

export interface LokaliseClientConfig {
  apiToken: string;
  projectId: string;
  baseLanguage?: string;
}

const BASE_URL = "https://api.lokalise.com/api2";

export class LokaliseClient {
  private readonly apiToken: string;
  private readonly projectId: string;
  readonly baseLanguage: string;
  private readonly rateLimiter: RateLimiter;

  constructor(config: LokaliseClientConfig) {
    this.apiToken = config.apiToken;
    this.projectId = config.projectId;
    this.baseLanguage = config.baseLanguage ?? "ko";
    this.rateLimiter = new RateLimiter();
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    return this.rateLimiter.wrap(async () => {
      const url = `${BASE_URL}${path}`;
      const res = await fetch(url, {
        ...options,
        headers: {
          "X-Api-Token": this.apiToken,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Lokalise API error ${res.status}: ${body}`,
        );
      }

      return res.json() as Promise<T>;
    });
  }

  /** 전체 key 목록 조회 (페이지네이션 자동 처리) */
  async getAllKeys(): Promise<LokaliseKey[]> {
    const allKeys: LokaliseKey[] = [];
    let page = 1;
    const limit = 500;

    while (true) {
      const response = await this.request<LokaliseKeysResponse>(
        `/projects/${this.projectId}/keys?page=${page}&limit=${limit}&include_translations=1`,
      );

      allKeys.push(...response.keys);

      if (response.keys.length < limit) break;
      page++;
    }

    return allKeys;
  }

  /** 신규 key 생성 */
  async createKeys(
    payload: LokaliseCreateKeyPayload,
  ): Promise<LokaliseKeysResponse> {
    return this.request<LokaliseKeysResponse>(
      `/projects/${this.projectId}/keys`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  /**
   * key의 translation 업데이트.
   * 단건 엔드포인트(PUT /keys/{key_id})는 translations를 받지 않고 조용히 무시한 뒤 200을 돌려주므로,
   * translations를 실제로 반영하는 multi-update(PUT /keys)를 사용한다.
   */
  async updateKeyTranslation(
    keyId: number,
    payload: LokaliseUpdateKeyPayload,
  ): Promise<void> {
    const response = await this.request<LokaliseKeysResponse>(
      `/projects/${this.projectId}/keys`,
      {
        method: "PUT",
        body: JSON.stringify({
          keys: [{ key_id: keyId, translations: payload.translations }],
        }),
      },
    );

    // multi-update는 부분 실패도 200으로 돌려주므로 응답을 직접 확인해야 한다
    const error = response.errors?.[0];
    if (error) {
      throw new Error(`Lokalise key 업데이트 실패 (key_id ${keyId}): ${error.message}`);
    }
    if (!response.keys.some((k) => k.key_id === keyId)) {
      throw new Error(`Lokalise가 key를 갱신하지 않았습니다 (key_id ${keyId})`);
    }
  }

  /** 프로젝트에 정의된 언어 목록 조회 */
  async getLanguages(): Promise<LokaliseLanguage[]> {
    const response = await this.request<LokaliseLanguagesResponse>(
      `/projects/${this.projectId}/languages`,
    );
    return response.languages;
  }

  /** key 단건 조회 (translations 포함) */
  async getKey(keyId: number): Promise<LokaliseKey> {
    const response = await this.request<LokaliseKeyResponse>(
      `/projects/${this.projectId}/keys/${keyId}?include_translations=1`,
    );
    return response.key;
  }

  /** key 이름으로 검색 */
  async searchKeys(query: string): Promise<LokaliseKey[]> {
    const response = await this.request<LokaliseKeysResponse>(
      `/projects/${this.projectId}/keys?filter_keys=${encodeURIComponent(query)}&include_translations=1`,
    );
    return response.keys;
  }

  /** key 삭제 (복수) */
  async deleteKeys(keyIds: number[]): Promise<void> {
    await this.request(
      `/projects/${this.projectId}/keys`,
      {
        method: "DELETE",
        body: JSON.stringify({ keys: keyIds }),
      },
    );
  }
}
