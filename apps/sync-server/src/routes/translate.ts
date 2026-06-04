import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { loadConfig } from "../config";
import { translateEnToFr } from "../services/translation";

const config = loadConfig();

const bodySchema = z.object({
  texts: z.record(z.string()),
});

export const translateRoutes: FastifyPluginAsync = async (app) => {
  app.post("/translate", async (req, reply) => {
    const { texts } = bodySchema.parse(req.body);

    if (!config.H_CHAT_API_KEY) {
      return reply.status(503).send({ error: "H_CHAT_API_KEY not configured" });
    }

    const translations = await translateEnToFr(texts, config.H_CHAT_API_KEY);
    return reply.send({ translations });
  });
};
