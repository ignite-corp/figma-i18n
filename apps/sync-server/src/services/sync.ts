import type { SyncItem, SyncResultItem } from "shared-types";
import { prisma } from "../lib/prisma";
import { loadConfig, resolveProjectId } from "../config";
import { getLokaliseClient } from "./cache";
import { logger } from "../lib/logger";

const config = loadConfig();

/** 승인된 항목들을 Lokalise에 반영하고 DB에 기록 */
export async function processSyncItems(
  figmaFileId: string,
  triggeredBy: string,
  items: SyncItem[],
  projectKey?: string,
): Promise<SyncResultItem[]> {
  const projectId = resolveProjectId(config, projectKey);
  const lokalise = getLokaliseClient(projectKey);
  const results: SyncResultItem[] = [];

  // 프로젝트에 정의된 언어를 동적으로 조회
  const projectLanguages = await lokalise.getLanguages();
  const targetLanguages = projectLanguages
    .map((lang) => lang.lang_iso)
    .filter((iso) => iso !== lokalise.baseLanguage);

  logger.debug(
    { projectId, baseLanguage: lokalise.baseLanguage, targetLanguages },
    "Resolved project languages",
  );

  for (const item of items) {
    try {
      const result = await processSingleItem(
        figmaFileId, triggeredBy, item, projectId, lokalise, targetLanguages,
      );
      results.push(result);
    } catch (err) {
      logger.error({ err, item }, "Sync item failed");
      results.push({
        nodeId: item.nodeId,
        success: false,
        action: item.action,
        keyName: item.keyName,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}

async function processSingleItem(
  figmaFileId: string,
  triggeredBy: string,
  item: SyncItem,
  projectId: string,
  lokalise: ReturnType<typeof getLokaliseClient>,
  targetLanguages: string[],
): Promise<SyncResultItem> {
  switch (item.action) {
    case "create_new": {
      if (!item.keyName) throw new Error("keyName is required for create_new");

      // base language + target languages 모두에 번역 설정
      const allLanguages = [lokalise.baseLanguage, ...targetLanguages];

      // Lokalise에 key 생성
      const response = await lokalise.createKeys({
        keys: [
          {
            key_name: item.keyName,
            platforms: ["web"],
            translations: allLanguages.map((lang) => ({
              language_iso: lang,
              translation: item.text,
            })),
            tags: ["figma-sync"],
          },
        ],
      });

      const createdKey = response.keys[0];

      // DB: 매핑 저장
      await prisma.figmaKeyMapping.upsert({
        where: { figmaFileId_nodeId: { figmaFileId, nodeId: item.nodeId } },
        update: {
          keyName: item.keyName,
          sourceText: item.text,
          status: "ACTIVE",
          projectId,
        },
        create: {
          figmaFileId,
          nodeId: item.nodeId,
          projectId,
          keyName: item.keyName,
          sourceText: item.text,
          status: "ACTIVE",
        },
      });

      // 캐시에도 추가
      if (createdKey) {
        await prisma.lokaliseKeyCache.upsert({
          where: { projectId_lokaliseKeyId: { projectId, lokaliseKeyId: createdKey.key_id } },
          update: {
            keyName: item.keyName,
            baseValue: item.text,
            fetchedAt: new Date(),
          },
          create: {
            lokaliseKeyId: createdKey.key_id,
            projectId,
            keyName: item.keyName,
            baseValue: item.text,
            platforms: ["web"],
            tags: ["figma-sync"],
            fetchedAt: new Date(),
          },
        });
      }

      // History 기록
      await recordHistory(figmaFileId, item.nodeId, item.keyName, "KEY_CREATED", null, item.text, triggeredBy);

      return {
        nodeId: item.nodeId,
        success: true,
        action: item.action,
        keyName: item.keyName,
        lokaliseKeyId: createdKey?.key_id,
      };
    }

    case "link_existing": {
      if (!item.keyName) throw new Error("keyName is required for link_existing");

      // DB: 매핑 저장
      await prisma.figmaKeyMapping.upsert({
        where: { figmaFileId_nodeId: { figmaFileId, nodeId: item.nodeId } },
        update: {
          keyName: item.keyName,
          sourceText: item.text,
          status: "ACTIVE",
          projectId,
        },
        create: {
          figmaFileId,
          nodeId: item.nodeId,
          projectId,
          keyName: item.keyName,
          sourceText: item.text,
          status: "ACTIVE",
        },
      });

      await recordHistory(figmaFileId, item.nodeId, item.keyName, "KEY_LINKED", null, item.text, triggeredBy);

      return {
        nodeId: item.nodeId,
        success: true,
        action: item.action,
        keyName: item.keyName,
      };
    }

    case "update_source": {
      if (!item.keyName) throw new Error("keyName is required for update_source");

      // Lokalise key ID 찾기 (캐시에서)
      const cached = await prisma.lokaliseKeyCache.findFirst({
        where: { keyName: item.keyName, projectId },
      });

      if (cached) {
        await lokalise.updateKeyTranslation(cached.lokaliseKeyId, {
          translations: targetLanguages.map((lang) => ({
            language_iso: lang,
            translation: item.text,
            is_fuzzy: true,
          })),
        });

        // 캐시 업데이트
        await prisma.lokaliseKeyCache.update({
          where: { projectId_lokaliseKeyId: { projectId, lokaliseKeyId: cached.lokaliseKeyId } },
          data: { baseValue: item.text, fetchedAt: new Date() },
        });
      }

      // DB: 매핑 업데이트 (STALE → ACTIVE)
      await prisma.figmaKeyMapping.upsert({
        where: { figmaFileId_nodeId: { figmaFileId, nodeId: item.nodeId } },
        update: {
          sourceText: item.text,
          status: "ACTIVE",
          projectId,
        },
        create: {
          figmaFileId,
          nodeId: item.nodeId,
          projectId,
          keyName: item.keyName,
          sourceText: item.text,
          status: "ACTIVE",
        },
      });

      await recordHistory(
        figmaFileId, item.nodeId, item.keyName,
        "SOURCE_UPDATED", item.previousText ?? null, item.text, triggeredBy,
      );

      return {
        nodeId: item.nodeId,
        success: true,
        action: item.action,
        keyName: item.keyName,
      };
    }

    case "ignore": {
      await recordHistory(
        figmaFileId, item.nodeId, item.keyName ?? `__ignored__`,
        "IGNORED", null, item.text, triggeredBy,
      );

      return {
        nodeId: item.nodeId,
        success: true,
        action: item.action,
      };
    }

    default:
      throw new Error(`Unknown action: ${item.action}`);
  }
}

async function recordHistory(
  figmaFileId: string,
  nodeId: string,
  keyName: string,
  action: "KEY_CREATED" | "KEY_LINKED" | "SOURCE_UPDATED" | "KEY_UNLINKED" | "IGNORED",
  prevValue: string | null,
  newValue: string | null,
  triggeredBy: string,
) {
  await prisma.syncHistory.create({
    data: {
      figmaFileId,
      nodeId,
      keyName,
      action,
      prevValue,
      newValue,
      triggeredBy,
    },
  });
}
