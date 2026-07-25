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
  CHAPA_ENCRYPTION_KEY: z.string().optional().default(""),
  FAL_KEY: z.string().optional().default(""),
  // Voice request pipeline (marketplace module). Keys stay empty in the repo;
  // with no key each stage degrades to the next one instead of failing.
  WHISPERFLOW_API_KEY: z.string().optional().default(""),
  WHISPERFLOW_API_BASE: z.string().optional().default("https://api.whisperflow.ai/v1"),
  /** Addis AI transcribes Amharic / Afaan Oromo speech and is the STT of record. */
  ADDIS_AI_API_KEY: z.string().optional().default(""),
  ADDIS_AI_API_BASE: z.string().optional().default("https://api.addisassistant.com"),
  ADDIS_AI_MODEL: z.string().optional().default("Addis-፩-አሌፍ"),
  /**
   * Gemini turns the transcript into the structured request the matcher needs
   * and ranks the shortlist of providers. Authenticates with `?key=`, not a
   * bearer token — the generative-language endpoint rejects Authorization.
   */
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_API_BASE: z
    .string()
    .optional()
    .default("https://generativelanguage.googleapis.com/v1beta"),
  /**
   * Quota is per model per day, so this is the dial to turn when Gemini starts
   * 429ing mid-demo. Gemini 2.x and 3.x are both supported; the client picks the
   * right thinking setting from the name.
   */
  GEMINI_MODEL: z.string().optional().default("gemini-3.5-flash-lite"),
  DEMO_MODE: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v === "true" || v === "1"),

  // --- Identity & Money module (owner: @betselot) ---------------------------
  PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  WEB_APP_URL: z.string().default("http://localhost:5173"),
  /** "mock" issues codes from this API; "supabase" delegates to Supabase phone auth. */
  AUTH_OTP_PROVIDER: z.enum(["mock", "supabase"]).default("mock"),
  AUTH_OTP_TTL_SECONDS: z.coerce.number().default(300),
  AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().default(72),
  KYC_UPLOAD_DIR: z.string().default("./uploads"),
  KYC_MAX_UPLOAD_BYTES: z.coerce.number().default(5 * 1024 * 1024),
  /** Hackathon shortcut: skip human review and mark uploads verified on arrival. */
  KYC_AUTO_VERIFY: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  PLATFORM_FEE_PERCENT: z.coerce.number().default(5),
  /**
   * Receipt address used at checkout when a user has no email on file. Chapa
   * requires one and rejects domains without MX records, so this cannot be a
   * made-up domain. Max 50 characters.
   */
  CHAPA_FALLBACK_EMAIL: z.string().optional().default(""),
  /** Shared secret for the admin-only escrow release/refund endpoints. */
  ADMIN_API_KEY: z.string().optional().default(""),
});

export const env = envSchema.parse(process.env);
