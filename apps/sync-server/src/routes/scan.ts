import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { matchNodes } from "../services/matcher";
import type { NodeStatus, ScanResponse } from "shared-types";

const scanBodySchema = z.object({
  figmaFileId: z.string().min(1),
  projectId: z.string().optional(), // Lokalise project key (e.g. "dealer-fo")
  nodes: z.array(
    z.object({
      nodeId: z.string(),
      text: z.string(),
      parentPath: z.string(),
      metadata: z
        .object({
          fontSize: z.number().optional(),
          fontWeight: z.string().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
        })
        .optional(),
      existingMapping: z
        .object({
          key: z.string(),
          sourceText: z.string(),
        })
        .optional(),
    }),
  ),
});

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.post("/scan", async (req, reply) => {
    const body = scanBodySchema.parse(req.body);
    const results = await matchNodes(body.figmaFileId, body.nodes, body.projectId);

    const summary = results.reduce(
      (acc, r) => {
        acc[r.status]++;
        acc.total++;
        return acc;
      },
      { total: 0, matched: 0, candidate: 0, new: 0, changed: 0, ignored: 0 } as Record<
        NodeStatus | "total",
        number
      >,
    );

    const response: ScanResponse = { results, summary };
    return reply.send(response);
  });
};
