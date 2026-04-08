import { prisma } from "../lib/prisma";
import { LokaliseClient } from "lokalise-client";
import { loadConfig, resolveProjectId } from "../config";
import { logger } from "../lib/logger";
import type { CachedKey } from "shared-types";

const config = loadConfig();

/** projectId에 해당하는 LokaliseClient 생성 */
function createLokaliseClient(projectId: string): LokaliseClient {
  return new LokaliseClient({
    apiToken: config.LOKALISE_API_TOKEN,
    projectId,
    baseLanguage: config.LOKALISE_BASE_LANGUAGE,
  });
}

/** 캐시에서 모든 key 조회 (projectId 필터) */
export async function getCachedKeys(projectId?: string): Promise<CachedKey[]> {
  const pid = resolveProjectId(config, projectId);

  const rows = await prisma.lokaliseKeyCache.findMany({
    where: { isArchived: false, projectId: pid },
  });

  return rows.map((r) => ({
    lokaliseKeyId: r.lokaliseKeyId,
    keyName: r.keyName,
    baseValue: r.baseValue,
    platforms: r.platforms,
    tags: r.tags,
  }));
}

/** Lokalise에서 전체 key를 가져와 캐시 갱신 */
export async function refreshCache(projectId?: string): Promise<{
  totalKeys: number;
  duration: number;
}> {
  const pid = resolveProjectId(config, projectId);
  const lokalise = createLokaliseClient(pid);
  const cacheId = `lokalise_keys_${pid}`;
  const start = Date.now();

  // 상태: SYNCING
  await prisma.cacheMeta.upsert({
    where: { id: cacheId },
    update: { status: "SYNCING" },
    create: { id: cacheId, status: "SYNCING" },
  });

  try {
    const keys = await lokalise.getAllKeys();
    const baseLanguage = lokalise.baseLanguage;

    // 해당 프로젝트의 기존 캐시 삭제 후 새로 삽입
    await prisma.$transaction([
      prisma.lokaliseKeyCache.deleteMany({ where: { projectId: pid } }),
      prisma.lokaliseKeyCache.createMany({
        data: keys.map((k) => {
          const baseTranslation = k.translations.find(
            (t) => t.language_iso === baseLanguage,
          );
          return {
            lokaliseKeyId: k.key_id,
            projectId: pid,
            keyName: k.key_name.web || k.key_name.other,
            baseValue: baseTranslation?.translation ?? "",
            platforms: k.platforms,
            tags: k.tags,
            isArchived: k.is_archived,
            fetchedAt: new Date(),
          };
        }),
      }),
    ]);

    const duration = Date.now() - start;

    await prisma.cacheMeta.upsert({
      where: { id: cacheId },
      update: {
        status: "IDLE",
        totalKeys: keys.length,
        lastSyncAt: new Date(),
      },
      create: {
        id: cacheId,
        status: "IDLE",
        totalKeys: keys.length,
        lastSyncAt: new Date(),
      },
    });

    logger.info(`Cache refreshed [${pid}]: ${keys.length} keys in ${duration}ms`);
    return { totalKeys: keys.length, duration };
  } catch (err) {
    await prisma.cacheMeta.upsert({
      where: { id: cacheId },
      update: { status: "ERROR" },
      create: { id: cacheId, status: "ERROR" },
    });
    throw err;
  }
}

/** 캐시 상태 조회 */
export async function getCacheStatus(projectId?: string) {
  const pid = resolveProjectId(config, projectId);
  const cacheId = `lokalise_keys_${pid}`;

  const meta = await prisma.cacheMeta.findUnique({
    where: { id: cacheId },
  });

  return {
    projectId: pid,
    status: meta?.status?.toLowerCase() ?? "idle",
    totalKeys: meta?.totalKeys ?? 0,
    lastSyncAt: meta?.lastSyncAt?.toISOString() ?? null,
  };
}

/** Lokalise client를 외부에서 사용 (sync 등) */
export function getLokaliseClient(projectId?: string): LokaliseClient {
  const pid = resolveProjectId(config, projectId);
  return createLokaliseClient(pid);
}
