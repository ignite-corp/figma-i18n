import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig, getAvailableProjects } from "./config";
import { logger } from "./lib/logger";
import { scanRoutes } from "./routes/scan";
import { syncRoutes } from "./routes/sync";
import { cacheRoutes } from "./routes/cache";
import { keysRoutes } from "./routes/keys";
import { historyRoutes } from "./routes/history";
import { translateRoutes } from "./routes/translate";
import { refreshCache } from "./services/cache";

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
await app.register(translateRoutes, { prefix: "/api" });

async function refreshAllProjectsOnStart() {
  const projects = getAvailableProjects(config);
  logger.info(`🔄 Starting cache refresh for ${projects.length} project(s)...`);
  for (const project of projects) {
    try {
      const { totalKeys, duration } = await refreshCache(project.id);
      logger.info(`✅ Cache ready [${project.name}]: ${totalKeys} keys in ${duration}ms`);
    } catch (err) {
      logger.error(`❌ Cache refresh failed [${project.name}]: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(`🚀 Sync server running on http://${config.HOST}:${config.PORT}`);
  refreshAllProjectsOnStart().catch((err) =>
    logger.error("Startup cache refresh failed", err),
  );
} catch (err) {
  logger.error(err);
  process.exit(1);
}
