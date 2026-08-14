import type { BulkKeyItem, BulkKeyResult, KeyEntry } from "shared-types";
import { prisma } from "../lib/prisma";
import { loadConfig, resolveProjectId } from "../config";
import { getLokaliseClient } from "./cache";
import { translateEnToFr, isEnglishLocale, isFrenchLocale } from "./translation";
import { logger } from "../lib/logger";

const config = loadConfig();

/** 랭킹 대상으로 뽑아올 최대 후보 수 */
const FIND_CANDIDATE_LIMIT = 200;

/** Lokalise 실시간 조회 시 한 요청에 담을 key 수 (URL 길이 제한 고려) */
const LIVE_LOOKUP_CHUNK_SIZE = 50;

/** keyName 또는 value에 대한 부분 일치 검색 */
export async function findKeys(
  query: string,
  limit: number,
  projectKey?: string,
): Promise<{ results: KeyEntry[]; total: number }> {
  const projectId = resolveProjectId(config, projectKey);
  const where = {
    projectId,
    isArchived: false,
    OR: [
      { keyName: { contains: query, mode: "insensitive" as const } },
      { baseValue: { contains: query, mode: "insensitive" as const } },
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.lokaliseKeyCache.findMany({
      where,
      take: FIND_CANDIDATE_LIMIT,
      orderBy: { keyName: "asc" },
    }),
    prisma.lokaliseKeyCache.count({ where }),
  ]);

  const q = query.toLowerCase();
  const score = (row: { keyName: string; baseValue: string }): number => {
    const key = row.keyName.toLowerCase();
    if (key === q) return 0;
    if (key.startsWith(q)) return 1;
    if (key.includes(q)) return 2;
    return 3; // value만 일치
  };

  const results = rows
    .sort((a, b) => score(a) - score(b) || a.keyName.localeCompare(b.keyName))
    .slice(0, limit)
    .map(toKeyEntry);

  return { results, total };
}

/**
 * keyName 목록의 Lokalise 최신 값을 조회하고 캐시에 반영 (JSON 미리보기용).
 * 캐시만 보면 Lokalise에서 직접 수정된 내용을 놓치므로 해당 key들만 실시간 확인한다.
 */
export async function lookupKeys(
  keyNames: string[],
  projectKey?: string,
): Promise<KeyEntry[]> {
  const projectId = resolveProjectId(config, projectKey);
  const lokalise = getLokaliseClient(projectKey);

  const live = await fetchLiveValues(lokalise, keyNames);
  await syncCacheFromLive(projectId, live);

  return [...live.values()];
}

/** 단일 key의 value 업데이트 (전 언어 반영, FR 계열은 자동 번역) */
export async function updateKeyValue(input: {
  keyName: string;
  value: string;
  projectKey?: string;
  figmaFileId?: string;
  triggeredBy?: string;
  expectedValue?: string;
  force?: boolean;
}): Promise<{ status: "updated" | "conflict"; key: KeyEntry }> {
  const projectId = resolveProjectId(config, input.projectKey);
  const lokalise = getLokaliseClient(input.projectKey);

  // 쓰기 직전 Lokalise 최신 값과 대조 (사용자가 본 값이 옛날 값이면 덮어쓰기 방지)
  if (input.expectedValue !== undefined && !input.force) {
    const live = await fetchLiveValues(lokalise, [input.keyName]);
    await syncCacheFromLive(projectId, live);

    const current = live.get(input.keyName);
    if (!current) throw new Error(`Lokalise에 없는 key입니다: ${input.keyName}`);
    if (current.baseValue !== input.expectedValue) {
      logger.info(
        { keyName: input.keyName },
        "Lokalise 최신 값과 달라 업데이트를 보류함",
      );
      return { status: "conflict", key: current };
    }
  }

  const buildTranslations = await createTranslationBuilder(lokalise, {
    [input.keyName]: input.value,
  });

  const key = await applyKeyUpdate({
    ...input,
    projectId,
    lokalise,
    buildTranslations,
  });

  return { status: "updated", key };
}

/** 번역 배열이 이미 준비된 상태에서 실제 업데이트를 수행 */
async function applyKeyUpdate(input: {
  keyName: string;
  value: string;
  projectId: string;
  lokalise: ReturnType<typeof getLokaliseClient>;
  buildTranslations: TranslationBuilder;
  figmaFileId?: string;
  triggeredBy?: string;
}): Promise<KeyEntry> {
  const { keyName, value, projectId } = input;

  const cached = await prisma.lokaliseKeyCache.findFirst({
    where: { keyName, projectId },
  });
  if (!cached) throw new Error(`캐시에 없는 key입니다: ${keyName}`);

  await input.lokalise.updateKeyTranslation(cached.lokaliseKeyId, {
    translations: input.buildTranslations(keyName, value),
  });

  await prisma.lokaliseKeyCache.update({
    where: { projectId_lokaliseKeyId: { projectId, lokaliseKeyId: cached.lokaliseKeyId } },
    data: { baseValue: value, fetchedAt: new Date() },
  });

  await recordKeyHistory({
    figmaFileId: input.figmaFileId,
    keyName,
    action: "SOURCE_UPDATED",
    prevValue: cached.baseValue,
    newValue: value,
    triggeredBy: input.triggeredBy,
  });

  return { lokaliseKeyId: cached.lokaliseKeyId, keyName, baseValue: value };
}

/** JSON 대량 반영 — create는 한 번의 배치 요청, update는 건별 요청 */
export async function bulkUpsertKeys(input: {
  items: BulkKeyItem[];
  projectKey?: string;
  figmaFileId?: string;
  triggeredBy?: string;
}): Promise<BulkKeyResult[]> {
  const projectId = resolveProjectId(config, input.projectKey);
  const lokalise = getLokaliseClient(input.projectKey);

  // 쓰기 직전 대상 key들의 Lokalise 최신 상태를 한 번에 확인
  const live = await fetchLiveValues(
    lokalise,
    input.items.map((i) => i.keyName),
  );
  await syncCacheFromLive(projectId, live);

  const results: BulkKeyResult[] = [];
  const creates: BulkKeyItem[] = [];
  const updates: BulkKeyItem[] = [];

  for (const item of input.items) {
    const current = live.get(item.keyName);

    if (item.mode === "create") {
      if (current) {
        results.push({
          keyName: item.keyName,
          mode: "create",
          success: false,
          conflict: true,
          error: "이미 Lokalise에 존재하는 key입니다 — 미리보기를 다시 실행해주세요",
        });
        continue;
      }
      creates.push(item);
      continue;
    }

    if (!current) {
      results.push({
        keyName: item.keyName,
        mode: "update",
        success: false,
        conflict: true,
        error: "Lokalise에 없는 key입니다 — 미리보기를 다시 실행해주세요",
      });
      continue;
    }
    if (item.expectedValue !== undefined && current.baseValue !== item.expectedValue) {
      results.push({
        keyName: item.keyName,
        mode: "update",
        success: false,
        conflict: true,
        error: `Lokalise에서 이미 변경된 값입니다 (현재: "${current.baseValue}") — 미리보기를 다시 실행해주세요`,
      });
      continue;
    }
    updates.push(item);
  }

  if (creates.length === 0 && updates.length === 0) return results;

  // 번역은 실제로 반영할 항목만 한 번에 배치 처리
  const buildTranslations = await createTranslationBuilder(
    lokalise,
    Object.fromEntries([...creates, ...updates].map((i) => [i.keyName, i.value])),
  );

  if (creates.length > 0) {
    results.push(
      ...(await runCreates(creates, projectId, lokalise, buildTranslations, input)),
    );
  }

  for (const item of updates) {
    try {
      await applyKeyUpdate({
        keyName: item.keyName,
        value: item.value,
        projectId,
        lokalise,
        buildTranslations,
        figmaFileId: input.figmaFileId,
        triggeredBy: input.triggeredBy,
      });
      results.push({ keyName: item.keyName, mode: "update", success: true });
    } catch (err) {
      logger.error({ err, keyName: item.keyName }, "Bulk update 실패");
      results.push({
        keyName: item.keyName,
        mode: "update",
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}

/** Lokalise에서 해당 key들의 현재 값을 조회 (이름 기준, 청크 단위) */
async function fetchLiveValues(
  lokalise: ReturnType<typeof getLokaliseClient>,
  keyNames: string[],
): Promise<Map<string, KeyEntry>> {
  const unique = [...new Set(keyNames)];
  const found = new Map<string, KeyEntry>();

  for (let i = 0; i < unique.length; i += LIVE_LOOKUP_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + LIVE_LOOKUP_CHUNK_SIZE);
    const keys = await lokalise.searchKeys(chunk.join(","));

    for (const key of keys) {
      const keyName = key.key_name.web || key.key_name.other;
      // filter_keys가 부분 일치를 반환할 수 있으므로 이름이 정확히 같은 것만 사용
      if (!chunk.includes(keyName)) continue;
      found.set(keyName, {
        lokaliseKeyId: key.key_id,
        keyName,
        baseValue:
          key.translations.find((t) => t.language_iso === lokalise.baseLanguage)
            ?.translation ?? "",
      });
    }
  }

  return found;
}

/** 실시간 조회 결과를 캐시에 반영 */
async function syncCacheFromLive(projectId: string, live: Map<string, KeyEntry>) {
  for (const key of live.values()) {
    await prisma.lokaliseKeyCache.upsert({
      where: { projectId_lokaliseKeyId: { projectId, lokaliseKeyId: key.lokaliseKeyId } },
      update: { keyName: key.keyName, baseValue: key.baseValue, fetchedAt: new Date() },
      create: {
        lokaliseKeyId: key.lokaliseKeyId,
        projectId,
        keyName: key.keyName,
        baseValue: key.baseValue,
        platforms: ["web"],
        fetchedAt: new Date(),
      },
    });
  }
}

async function runCreates(
  creates: BulkKeyItem[],
  projectId: string,
  lokalise: ReturnType<typeof getLokaliseClient>,
  buildTranslations: TranslationBuilder,
  input: { figmaFileId?: string; triggeredBy?: string },
): Promise<BulkKeyResult[]> {
  try {
    const response = await lokalise.createKeys({
      keys: creates.map((item) => ({
        key_name: item.keyName,
        platforms: ["web"],
        translations: buildTranslations(item.keyName, item.value).map((t) => ({
          language_iso: t.language_iso,
          translation: t.translation,
        })),
        tags: ["figma-sync"],
      })),
    });

    const createdByName = new Map(
      response.keys.map((k) => [k.key_name.web || k.key_name.other, k]),
    );
    const errorMessage = response.errors?.[0]?.message;

    const results: BulkKeyResult[] = [];
    for (const item of creates) {
      const created = createdByName.get(item.keyName);
      if (!created) {
        results.push({
          keyName: item.keyName,
          mode: "create",
          success: false,
          error: errorMessage ?? "Lokalise가 key를 생성하지 않았습니다",
        });
        continue;
      }

      await prisma.lokaliseKeyCache.upsert({
        where: { projectId_lokaliseKeyId: { projectId, lokaliseKeyId: created.key_id } },
        update: { keyName: item.keyName, baseValue: item.value, fetchedAt: new Date() },
        create: {
          lokaliseKeyId: created.key_id,
          projectId,
          keyName: item.keyName,
          baseValue: item.value,
          platforms: ["web"],
          tags: ["figma-sync"],
          fetchedAt: new Date(),
        },
      });

      await recordKeyHistory({
        figmaFileId: input.figmaFileId,
        keyName: item.keyName,
        action: "KEY_CREATED",
        prevValue: null,
        newValue: item.value,
        triggeredBy: input.triggeredBy,
      });

      results.push({ keyName: item.keyName, mode: "create", success: true });
    }

    return results;
  } catch (err) {
    logger.error({ err, count: creates.length }, "Bulk create 실패");
    const message = err instanceof Error ? err.message : "Unknown error";
    return creates.map((item) => ({
      keyName: item.keyName,
      mode: "create" as const,
      success: false,
      error: message,
    }));
  }
}

type TranslationBuilder = (
  keyName: string,
  value: string,
) => Array<{ language_iso: string; translation: string; is_fuzzy?: boolean }>;

/**
 * 프로젝트 전 언어에 대한 translation 배열 생성기.
 * base가 EN이고 FR 계열 언어가 있으면 DeepL 배치 번역 결과를 사용한다.
 */
async function createTranslationBuilder(
  lokalise: ReturnType<typeof getLokaliseClient>,
  texts: Record<string, string>,
): Promise<TranslationBuilder> {
  const languages = (await lokalise.getLanguages()).map((l) => l.lang_iso);
  const needsFrench =
    isEnglishLocale(lokalise.baseLanguage) && languages.some(isFrenchLocale);

  let frTexts: Record<string, string> = {};
  if (needsFrench) {
    const { translations, hasErrors } = await translateEnToFr(texts, config.DEEPL_API_KEY);
    if (hasErrors) logger.warn("일부 FR 번역 실패 — 해당 항목은 원문 사용");
    frTexts = translations;
  }

  return (keyName, value) =>
    languages.map((lang) => {
      const fr = isFrenchLocale(lang) ? frTexts[keyName] : undefined;
      const translation = fr ?? value;
      return {
        language_iso: lang,
        translation,
        ...(translation !== value ? { is_fuzzy: true } : {}),
      };
    });
}

function toKeyEntry(row: {
  lokaliseKeyId: number;
  keyName: string;
  baseValue: string;
}): KeyEntry {
  return {
    lokaliseKeyId: row.lokaliseKeyId,
    keyName: row.keyName,
    baseValue: row.baseValue,
  };
}

async function recordKeyHistory(input: {
  figmaFileId?: string;
  keyName: string;
  action: "KEY_CREATED" | "SOURCE_UPDATED";
  prevValue: string | null;
  newValue: string | null;
  triggeredBy?: string;
}) {
  await prisma.syncHistory.create({
    data: {
      figmaFileId: input.figmaFileId || "__direct__",
      nodeId: null,
      keyName: input.keyName,
      action: input.action,
      prevValue: input.prevValue,
      newValue: input.newValue,
      triggeredBy: input.triggeredBy || "unknown",
    },
  });
}
