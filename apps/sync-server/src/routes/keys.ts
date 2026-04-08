import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCachedKeys } from "../services/cache";
import { findMatches } from "i18n-matcher";

const searchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  projectId: z.string().optional(),
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
};
