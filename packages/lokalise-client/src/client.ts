import { RateLimiter } from "./rate-limiter";
import type {
  LokaliseKey,
  LokaliseKeysResponse,
  LokaliseCreateKeyPayload,
  LokaliseUpdateKeyPayload,
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

  /** key의 translation 업데이트 */
  async updateKeyTranslation(
    keyId: number,
    payload: LokaliseUpdateKeyPayload,
  ): Promise<void> {
    // Lokalise API: translation은 key가 아닌 translation ID로 업데이트
    // 먼저 key의 translation 목록에서 해당 언어의 translation_id를 찾아야 함
    // 여기서는 key update 방식으로 처리
    await this.request(
      `/projects/${this.projectId}/keys/${keyId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          translations: payload.translations,
        }),
      },
    );
  }

  /** key 이름으로 검색 */
  async searchKeys(query: string): Promise<LokaliseKey[]> {
    const response = await this.request<LokaliseKeysResponse>(
      `/projects/${this.projectId}/keys?filter_keys=${encodeURIComponent(query)}&include_translations=1`,
    );
    return response.keys;
  }
}
