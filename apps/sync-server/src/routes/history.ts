import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getHistory } from "../services/history";

const historyQuerySchema = z.object({
  figmaFileId: z.string().optional(),
  keyName: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const historyRoutes: FastifyPluginAsync = async (app) => {
  app.get("/history", async (req, reply) => {
    const query = historyQuerySchema.parse(req.query);

    const result = await getHistory({
      figmaFileId: query.figmaFileId,
      keyName: query.keyName,
      page: query.page,
      limit: query.limit,
    });

    return reply.send(result);
  });
};
