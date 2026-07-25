import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z
    .string()
    .default("postgresql://zeyla:zeyla@localhost:5432/zeyla"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_ANON_KEY: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  CHAPA_SECRET_KEY: z.string().optional().default(""),
  CHAPA_PUBLIC_KEY: z.string().optional().default(""),
  CHAPA_API_BASE: z.string().optional().default("https://api.chapa.co/v1"),
  CHAPA_WEBHOOK_SECRET: z.string().optional().default(""),
  FAL_KEY: z.string().optional().default(""),
  DEMO_MODE: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
});

export const env = envSchema.parse(process.env);
