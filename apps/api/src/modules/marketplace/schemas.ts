import { z } from "zod";
import { URGENCY_LEVELS } from "@zeyla/shared";

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

export const providerPingsQuerySchema = z.object({
  status: z.enum(["sent", "seen", "accepted", "declined"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
