import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { processSyncItems } from "../services/sync";
import type { SyncResponse } from "shared-types";

const syncBodySchema = z.object({
  figmaFileId: z.string().min(1),
  triggeredBy: z.string().min(1),
  projectId: z.string().optional(),
  items: z.array(
    z.object({
      nodeId: z.string(),
      action: z.enum(["link_existing", "create_new", "update_source", "ignore", "delete_key"]),
      keyName: z.string().optional(),
      text: z.string(),
      previousText: z.string().optional(),
      value: z.string().optional(),
    }),
  ),
});

export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.post("/sync", async (req, reply) => {
    const body = syncBodySchema.parse(req.body);

    const results = await processSyncItems(
      body.figmaFileId,
      body.triggeredBy,
      body.items,
      body.projectId,
    );

    const succeeded = results.filter((r) => r.success).length;

    const response: SyncResponse = {
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
