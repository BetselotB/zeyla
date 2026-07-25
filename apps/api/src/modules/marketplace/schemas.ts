import { z } from "zod";
import { SERVICE_CATEGORIES, SUB_CITIES, URGENCY_LEVELS } from "@zeyla/shared";

export const latSchema = z.coerce.number().min(-90).max(90);
export const lngSchema = z.coerce.number().min(-180).max(180);
export const uuidSchema = z.string().uuid();

/** Query strings arrive as text, so "false" must not become `true`. */
const boolish = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .nullish()
    .transform((v) => v ?? null);

export const providerSearchSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  radiusMeters: z.coerce.number().int().min(100).max(50_000).default(5_000),
  category: optionalText(40),
  minTrust: z.coerce.number().min(0).max(100).default(0),
  onlineOnly: boolish.default(false),
  q: optionalText(80),
  sort: z.enum(["trust", "distance"]).default("trust"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const providerDetailQuerySchema = z.object({
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
});

/**
 * Provider profile from the onboarding form. `category` is the canonical slug,
 * not the label shown in the dropdown — discovery filters on an exact match, so
 * a free-text category here would make the provider unsearchable.
 */
export const providerProfileSchema = z
  .object({
    category: z.enum(SERVICE_CATEGORIES),
    businessName: z.string().trim().min(2).max(80),
    subCity: z.enum(SUB_CITIES),
    bio: z.string().trim().min(10).max(500),
    experienceYears: z.coerce.number().int().min(0).max(60),
    priceMin: z.coerce.number().min(0).max(1_000_000),
    priceMax: z.coerce.number().min(0).max(1_000_000),
    contactPhone: z.string().trim().min(7).max(20).optional(),
    fullName: z.string().trim().min(2).max(80).optional(),
    serviceRadiusMeters: z.coerce.number().int().min(500).max(50_000).optional(),
    lat: latSchema.optional(),
    lng: lngSchema.optional(),
  })
  .refine((v) => v.priceMax >= v.priceMin, {
    message: "priceMax must be greater than or equal to priceMin",
    path: ["priceMax"],
  });

export const createRequestSchema = z.object({
  category: z.string().trim().min(2).max(40),
  description: optionalText(500),
  urgency: z.enum(URGENCY_LEVELS).default("normal"),
  lat: latSchema,
  lng: lngSchema,
  addressLabel: optionalText(120),
  radiusMeters: z.coerce.number().int().min(100).max(50_000).default(5_000),
});

export const fanoutSchema = z.object({
  /** Explicit shortlist from the discovery UI. Omit to auto-pick nearby providers. */
  providerIds: z.array(uuidSchema).max(20).optional(),
  maxProviders: z.coerce.number().int().min(1).max(20).default(5),
  minTrust: z.coerce.number().min(0).max(100).default(0),
  radiusMeters: z.coerce.number().int().min(100).max(50_000).optional(),
  onlineOnly: boolish.default(true),
  expiresInSeconds: z.coerce.number().int().min(30).max(1800).default(300),
});

export const pingResponseSchema = z.object({
  action: z.enum(["seen", "accepted", "declined"]),
});

export const voiceRequestSchema = z.object({
  audioUrl: z.string().url().max(1000).optional(),
  /** Base64 audio for a short clip; larger recordings should be uploaded and sent as a URL. */
  audioBase64: z.string().max(8_000_000).optional(),
  transcript: z.string().trim().min(2).max(2000).optional(),
  mimeType: z.string().max(80).optional(),
  language: z.string().max(16).optional(),
  lat: latSchema,
  lng: lngSchema,
  radiusMeters: z.coerce.number().int().min(100).max(50_000).optional(),
  /**
   * Corrections from the confirm screen. Only set these when the customer
   * actually changed something — they overrule the model, which is the point.
   */
  category: z.enum(SERVICE_CATEGORIES).optional(),
  urgency: z.enum(URGENCY_LEVELS).optional(),
});

export const voiceParseSchema = z.object({
  transcript: z.string().trim().min(2).max(2000),
  language: z.string().max(16).optional(),
});

/** Transcribe only — the intake screen shows the text before anything is created. */
export const transcribeSchema = z
  .object({
    audioBase64: z.string().max(8_000_000).optional(),
    audioUrl: z.string().url().max(1000).optional(),
    mimeType: z.string().max(80).optional(),
    /** UI language picker: "am", "om", or "en". */
    language: z.string().max(16).optional(),
  })
  .refine((v) => Boolean(v.audioBase64 || v.audioUrl), {
    message: "audioBase64 or audioUrl is required",
    path: ["audioBase64"],
  });

export const matchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(5),
  /** Off by default: a shortlist the customer can read beats an empty one. */
  onlineOnly: boolish.default(false),
  minTrust: z.coerce.number().min(0).max(100).default(0),
});

export const pairSchema = z.object({
  /** Omit to let the ranking pick. Accepts snake_case for the discovery UI. */
  providerId: uuidSchema.optional(),
  provider_id: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(10).default(3),
  onlineOnly: boolish.default(false),
  minTrust: z.coerce.number().min(0).max(100).default(0),
});

export const providerPingsQuerySchema = z.object({
  status: z.enum(["sent", "seen", "accepted", "declined"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
