import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string(),
  DIRECT_URL: z.string().optional(),
  LOKALISE_API_TOKEN: z.string().min(1),
  LOKALISE_PROJECT_ID: z.string().min(1), // 기본 프로젝트
  LOKALISE_BASE_LANGUAGE: z.string().default("ko"),
  LOKALISE_TARGET_LANGUAGES: z.string().default("en,en_CA,fr_CA"),
  LOKALISE_PROJECT_DEALER_FO: z.string().optional(),
  LOKALISE_PROJECT_DEALER_BO: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CORS_ORIGIN: z.string().default("*"),
  H_CHAT_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

/** 사용 가능한 Lokalise 프로젝트 목록 */
export function getAvailableProjects(config: Env): Array<{ id: string; name: string }> {
  const projects: Array<{ id: string; name: string }> = [];

  if (config.LOKALISE_PROJECT_DEALER_FO) {
    projects.push({ id: config.LOKALISE_PROJECT_DEALER_FO, name: "dealer-fo" });
  }
  if (config.LOKALISE_PROJECT_DEALER_BO) {
    projects.push({ id: config.LOKALISE_PROJECT_DEALER_BO, name: "dealer-bo" });
  }

  // 기본 프로젝트가 목록에 없으면 추가
  if (!projects.some((p) => p.id === config.LOKALISE_PROJECT_ID)) {
    projects.push({ id: config.LOKALISE_PROJECT_ID, name: "default" });
  }

  return projects;
}

/** projectId를 name이나 id로 조회 */
export function resolveProjectId(config: Env, projectKey?: string): string {
  if (!projectKey) return config.LOKALISE_PROJECT_ID;

  const projects = getAvailableProjects(config);
  const found = projects.find((p) => p.name === projectKey || p.id === projectKey);
  return found?.id ?? config.LOKALISE_PROJECT_ID;
}
