import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { loadConfig } from "../config";
import { translateEnToFr } from "../services/translation";

const config = loadConfig();

const bodySchema = z.object({
  texts: z.record(z.string()),
  apiKey: z.string().optional(),
});

export const translateRoutes: FastifyPluginAsync = async (app) => {
  app.post("/translate", async (req, reply) => {
    const { texts, apiKey } = bodySchema.parse(req.body);

    const key = apiKey || config.H_CHAT_API_KEY;
    if (!key) {
      return reply.status(503).send({ error: "H Chat API Key가 없습니다. 플러그인 설정에서 입력해주세요." });
    }

    const translations = await translateEnToFr(texts, key);
    return reply.send({ translations });
  });
};
