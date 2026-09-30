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

/**
 * Render 무료 플랜은 15분간 요청이 없으면 인스턴스를 중지시키고,
 * 다음 요청에서 콜드 스타트로 10초 이상 지연된다. 주기적으로 자기 자신을 호출해 유지한다.
 * RENDER_EXTERNAL_URL은 Render가 자동 주입하므로 로컬에서는 동작하지 않는다.
 *
 * 무료 인스턴스 시간(workspace 공용 월 750h)을 아끼기 위해 평일 09~24시(KST)에만 호출한다.
 * 그 외 시간에는 인스턴스가 중지되고, 이후 첫 요청이 콜드 스타트로 깨운다.
 */
const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function isKeepAliveWindow(now = new Date()) {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const day = kst.getUTCDay(); // 0=일, 6=토
  const hour = kst.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 9;
}

function startKeepAlive() {
  const externalUrl = process.env.RENDER_EXTERNAL_URL;
  if (!externalUrl) return;

  const timer = setInterval(() => {
    if (!isKeepAliveWindow()) return;
    fetch(`${externalUrl}/health`).catch((err) =>
      logger.warn(`Keep-alive ping 실패: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, KEEP_ALIVE_INTERVAL_MS);
  timer.unref();

  logger.info(`⏱️  Keep-alive enabled: ${externalUrl}/health every ${KEEP_ALIVE_INTERVAL_MS / 60000}min (weekdays 09-24 KST)`);
}

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
  startKeepAlive();
  refreshAllProjectsOnStart().catch((err) =>
    logger.error("Startup cache refresh failed", err),
  );
} catch (err) {
  logger.error(err);
  process.exit(1);
}
