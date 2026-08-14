import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCachedKeys } from "../services/cache";
import { findKeys, lookupKeys, updateKeyValue, bulkUpsertKeys } from "../services/keys";
import { findMatches } from "i18n-matcher";
import type {
  KeyFindResponse,
  KeyLookupResponse,
  KeyUpdateResponse,
  BulkKeysResponse,
} from "shared-types";

const searchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  projectId: z.string().optional(),
});

const findQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().min(1).max(100).default(30),
  projectId: z.string().optional(),
});

const lookupBodySchema = z.object({
  keyNames: z.array(z.string().min(1)).max(500),
  projectId: z.string().optional(),
});

const updateBodySchema = z.object({
  keyName: z.string().min(1),
  value: z.string(),
  projectId: z.string().optional(),
  figmaFileId: z.string().optional(),
  triggeredBy: z.string().optional(),
});

const bulkBodySchema = z.object({
  items: z
    .array(
      z.object({
        keyName: z.string().min(1),
        value: z.string(),
        mode: z.enum(["create", "update"]),
      }),
    )
    .min(1)
    .max(500),
  projectId: z.string().optional(),
  figmaFileId: z.string().optional(),
  triggeredBy: z.string().optional(),
});

export const keysRoutes: FastifyPluginAsync = async (app) => {
  app.get("/keys/search", async (req, reply) => {
    const query = searchQuerySchema.parse(req.query);
    const cachedKeys = await getCachedKeys(query.projectId);

    const matches = findMatches(query.q, cachedKeys, {
      maxCandidates: query.limit,
    });

    return reply.send({
      results: matches.map((m) => ({
        keyName: m.keyName,
        value: m.value,
        matchType: m.matchType,
      })),
    });
  });

  /** key 이름 / value 부분 일치 검색 */
  app.get("/keys/find", async (req, reply) => {
    const query = findQuerySchema.parse(req.query);
    const { results, total } = await findKeys(query.q, query.limit, query.projectId);

    const response: KeyFindResponse = { results, total };
    return reply.send(response);
  });

  /** key 이름 목록으로 존재 여부/현재 값 조회 */
  app.post("/keys/lookup", async (req, reply) => {
    const body = lookupBodySchema.parse(req.body);
    const found = await lookupKeys(body.keyNames, body.projectId);

    const response: KeyLookupResponse = { found };
    return reply.send(response);
  });

  /** 단일 key value 업데이트 */
  app.post("/keys/update", async (req, reply) => {
    const body = updateBodySchema.parse(req.body);
    const key = await updateKeyValue({
      keyName: body.keyName,
      value: body.value,
      projectKey: body.projectId,
      figmaFileId: body.figmaFileId,
      triggeredBy: body.triggeredBy,
    });

    const response: KeyUpdateResponse = { key };
    return reply.send(response);
  });

  /** JSON 대량 생성/업데이트 */
  app.post("/keys/bulk", async (req, reply) => {
    const body = bulkBodySchema.parse(req.body);
    const results = await bulkUpsertKeys({
      items: body.items,
      projectKey: body.projectId,
      figmaFileId: body.figmaFileId,
      triggeredBy: body.triggeredBy,
    });

    const succeeded = results.filter((r) => r.success).length;
    const response: BulkKeysResponse = {
      results,
      summary: {
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
      },
    };
    return reply.send(response);
  });
};
