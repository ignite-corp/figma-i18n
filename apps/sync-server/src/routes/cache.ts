import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { refreshCache, getCacheStatus } from "../services/cache";
import { getAvailableProjects, loadConfig } from "../config";

const config = loadConfig();

const refreshBodySchema = z.object({
  projectId: z.string().optional(),
}).optional();

const statusQuerySchema = z.object({
  projectId: z.string().optional(),
});

export const cacheRoutes: FastifyPluginAsync = async (app) => {
  app.post("/cache/refresh", async (req, reply) => {
    const body = refreshBodySchema.parse(req.body);
    const { totalKeys, duration } = await refreshCache(body?.projectId);
    const status = await getCacheStatus(body?.projectId);

    return reply.send({
      status: "completed",
      totalKeys,
      duration,
      lastSyncAt: status.lastSyncAt,
      projectId: status.projectId,
    });
  });

  app.get("/cache/status", async (req, reply) => {
    const query = statusQuerySchema.parse(req.query);
    const status = await getCacheStatus(query.projectId);
    return reply.send(status);
  });

  // 사용 가능한 프로젝트 목록
  app.get("/projects", async (_req, reply) => {
    return reply.send({ projects: getAvailableProjects(config) });
  });
};
