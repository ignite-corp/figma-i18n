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

    const { translations, hasErrors } = await translateEnToFr(
      texts,
      config.LIBRETRANSLATE_URL,
      config.LIBRETRANSLATE_API_KEY,
    );

    return reply.send({ translations, hasErrors });
  });
};
