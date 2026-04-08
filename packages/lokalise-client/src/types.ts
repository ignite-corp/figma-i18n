// Lokalise REST API 응답 타입

export interface LokaliseKey {
  key_id: number;
  key_name: {
    web: string;
    ios: string;
    android: string;
    other: string;
  };
  platforms: string[];
  tags: string[];
  is_archived: boolean;
  translations: LokaliseTranslation[];
}

export interface LokaliseTranslation {
  translation_id: number;
  language_iso: string;
  translation: string;
  is_reviewed: boolean;
  is_fuzzy: boolean;
}

export interface LokaliseKeysResponse {
  project_id: string;
  keys: LokaliseKey[];
  errors?: Array<{ message: string; code: number }>;
}

export interface LokaliseCreateKeyPayload {
  keys: Array<{
    key_name: string;
    platforms: string[];
    translations: Array<{
      language_iso: string;
      translation: string;
    }>;
    tags?: string[];
  }>;
}

export interface LokaliseUpdateKeyPayload {
  translations: Array<{
    language_iso: string;
    translation: string;
    is_fuzzy?: boolean;
  }>;
}

export interface LokaliseProjectResponse {
  project_id: string;
  name: string;
  base_language_iso: string;
}
