import { Router } from "express";
import { z } from "zod";
import type { ProviderTrustDto } from "@zeyla/shared";
import { computeTrustScore } from "@zeyla/shared";
import { requireActor } from "../marketplace/lib/actor.js";
import { handle } from "../marketplace/lib/handle.js";
import { uuidSchema } from "../marketplace/schemas.js";
import { buildTrustExplanation } from "./explain.js";
import {
  createFlag,
  createReview,
  listProviderFlags,
  listProviderReviews,
} from "./reviews.service.js";
import {
  getTrustHistory,
  getTrustInputs,
  recomputeTrustScore,
  scoreFromInputs,
} from "./trust.service.js";

/**
 * Trust score + reviews/flags. Recomputed on every write that feeds the
 * formula; history lands in trust_score_log. Shapes: ./API.md.
 */
export const trustRouter = Router();

const reviewSchema = z.object({
  contractId: uuidSchema,
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).nullish(),
  voiceUrl: z.string().url().max(500).nullish(),
  transcriptSource: z.enum(["whisperflow", "typed"]).nullish(),
});

const flagSchema = z.object({
  providerId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  contractId: uuidSchema.nullish(),
  reason: z.string().trim().min(3).max(500),
});

trustRouter.get("/preview", (_req, res) => {
  const breakdown = computeTrustScore({
    completedContracts: 5,
    avgRating: 4.5,
    kycVerified: true,
    firecrawlMatched: false,
    flagsReceived: 0,
  });
  res.json({
    success: true,
    data: {
      formula:
        "50 + min(completed * 2, 20) + ((avgRating - 1) / 4) * 20 + (kyc ? 10 : 0) + (firecrawl ? 5 : 0) - (flags * 5), floored at 0",
      example: breakdown,
    },
    error: null,
  });
});

/** The score plus the on-screen explanation. */
trustRouter.get(
  "/providers/:id",
  handle(async (req): Promise<ProviderTrustDto> => {
    const providerId = uuidSchema.parse(req.params.id);
    const inputs = await getTrustInputs(providerId);
    const breakdown = scoreFromInputs(inputs);

    return {
      providerId,
      providerName: inputs.providerName,
      trustScore: breakdown.total,
      breakdown,
      stats: {
        completedContracts: inputs.completedContracts,
        avgRating: inputs.avgRating,
        reviewCount: inputs.reviewCount,
        flagsReceived: inputs.flagsReceived,
        kycSubmitted: inputs.kycSubmitted,
        firecrawlMatched: inputs.firecrawlMatched,
      },
      explanation: buildTrustExplanation(breakdown, inputs, inputs.providerName),
    };
  }),
);

/**
 * Recompute on demand. Safe to expose and safe to call twice: the score is
 * derived from stored facts, so no caller can push it in a direction the data
 * does not already support. Escrow calls this when a contract completes.
 */
trustRouter.post(
  "/providers/:id/recompute",
  handle(async (req) => {
    const providerId = uuidSchema.parse(req.params.id);
    const reason = z
      .string()
      .trim()
      .min(3)
      .max(200)
      .default("manual recompute")
      .parse(req.body?.reason ?? undefined);
    return recomputeTrustScore(providerId, reason);
  }),
);

trustRouter.get(
  "/providers/:id/history",
  handle(async (req) => {
    const providerId = uuidSchema.parse(req.params.id);
    const entries = await getTrustHistory(providerId);
    return { entries };
  }),
);

trustRouter.get(
  "/providers/:id/reviews",
  handle(async (req) => {
    const providerId = uuidSchema.parse(req.params.id);
    const reviews = await listProviderReviews(providerId);
    return { reviews };
  }),
);

trustRouter.get(
  "/providers/:id/flags",
  handle(async (req) => {
    const providerId = uuidSchema.parse(req.params.id);
    const flags = await listProviderFlags(providerId);
    return { flags };
  }),
);

trustRouter.post(
  "/reviews",
  handle(
    async (req) => {
      const actor = requireActor(req);
      const input = reviewSchema.parse(req.body);
      return createReview(actor, input);
    },
    { status: 201 },
  ),
);

trustRouter.post(
  "/flags",
  handle(
    async (req) => {
      const actor = requireActor(req);
      const input = flagSchema.parse(req.body);
      return createFlag(actor, input);
    },
    { status: 201 },
  ),
);
