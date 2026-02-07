import { config } from "dotenv";
import { z } from "zod";

// Load environment variables
config();

const envSchema = z.object({
  // Database
  DATABASE_HOST: z.string().default("localhost"),
  DATABASE_PORT: z.string().transform(Number).default("3306"),
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string().default("pos_db"),

  // Server
  HOST: z.string().default("0.0.0.0"),
  PORT: z.string().transform(Number).default("3000"),
  WS_PORT: z.string().transform(Number).default("3001"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  API_PREFIX: z.string().default("/api"),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),

  // CORS
  CORS_ORIGIN: z.string().default("*"),

  // Rate Limiting
  RATE_LIMIT_MAX: z.string().transform(Number).default("100"),
  RATE_LIMIT_TIMEWINDOW: z.string().transform(Number).default("60000"),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_SECURE: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  LOG_FILE_PATH: z.string().default("./logs"),

  // License
  LICENSE_GRACE_PERIOD_DAYS: z.string().transform(Number).default("7"),
  LICENSE_VERIFICATION_INTERVAL_DAYS: z
    .string()
    .transform(Number)
    .default("30"),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("❌ Environment validation failed:");
    console.error(error.errors);
    process.exit(1);
  }
  throw error;
}

export { env };
