import { z } from "zod";

const environmentSchema = z.object({
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
  DATA_DIR: z.string().trim().min(1).default("./data"),
  DATABASE_PATH: z
    .string()
    .trim()
    .min(1)
    .default("./data/theater-campaign.sqlite"),
  OLLAMA_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().trim().min(1).default(""),
  OLLAMA_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(900_000)
    .default(120_000),
  OLLAMA_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  OLLAMA_QUEUE_CAPACITY: z.coerce.number().int().min(1).max(100).default(8),
  OLLAMA_RESPONSE_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(1_048_576)
    .default(65_536),
  GOD_MODE_ENABLED: z.coerce.boolean().default(false),
  LOG_LEVEL: z
    .enum(["silent", "error", "warn", "info", "debug"])
    .default("info"),
});

export type AppConfig = {
  host: string;
  port: number;
  dataDir: string;
  databasePath: string;
  ollamaUrl: string;
  ollamaModel: string;
  ollamaTimeoutMs: number;
  ollamaConcurrency: number;
  ollamaQueueCapacity: number;
  ollamaResponseLimitBytes: number;
  godModeEnabled: boolean;
  logLevel: "silent" | "error" | "warn" | "info" | "debug";
};

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(
        (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
      )
      .join("; ");
    throw new Error(`Invalid application configuration: ${details}`);
  }

  return {
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    dataDir: parsed.data.DATA_DIR,
    databasePath: parsed.data.DATABASE_PATH,
    ollamaUrl: parsed.data.OLLAMA_URL,
    ollamaModel: parsed.data.OLLAMA_MODEL,
    ollamaTimeoutMs: parsed.data.OLLAMA_TIMEOUT_MS,
    ollamaConcurrency: parsed.data.OLLAMA_CONCURRENCY,
    ollamaQueueCapacity: parsed.data.OLLAMA_QUEUE_CAPACITY,
    ollamaResponseLimitBytes: parsed.data.OLLAMA_RESPONSE_LIMIT_BYTES,
    godModeEnabled: parsed.data.GOD_MODE_ENABLED,
    logLevel: parsed.data.LOG_LEVEL,
  };
}
