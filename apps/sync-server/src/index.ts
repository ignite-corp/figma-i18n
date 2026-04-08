import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config";
import { logger } from "./lib/logger";
import { scanRoutes } from "./routes/scan";
import { syncRoutes } from "./routes/sync";
import { cacheRoutes } from "./routes/cache";
import { keysRoutes } from "./routes/keys";
import { historyRoutes } from "./routes/history";

const config = loadConfig();

const app = Fastify({ logger: false });

await app.register(cors, { origin: config.CORS_ORIGIN });

// Health check
app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

// API routes
await app.register(scanRoutes, { prefix: "/api" });
await app.register(syncRoutes, { prefix: "/api" });
await app.register(cacheRoutes, { prefix: "/api" });
await app.register(keysRoutes, { prefix: "/api" });
await app.register(historyRoutes, { prefix: "/api" });

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(`🚀 Sync server running on http://${config.HOST}:${config.PORT}`);
} catch (err) {
  logger.error(err);
  process.exit(1);
}
