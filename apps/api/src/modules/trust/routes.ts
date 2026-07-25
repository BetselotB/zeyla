import { Router } from "express";
import { computeTrustScore } from "@zeyla/shared";

/**
 * Trust score + reviews/flags.
 * Recompute on write; persist history in trust_score_log.
 */
export const trustRouter = Router();

trustRouter.get("/preview", (_req, res) => {
  const breakdown = computeTrustScore({
    completedContracts: 5,
    avgRating: 4.5,
    kycVerified: true,
    firecrawlMatched: false,
    flagsReceived: 0,
  });
  res.json({
    formula: "base 50 + completions + reviews + KYC + firecrawl − flags",
    example: breakdown,
  });
});

trustRouter.post("/reviews", (_req, res) => {
  res.status(501).json({
    error: "not_implemented",
    hint: "Only when contract.status=completed; optional Whisperflow voice review",
  });
});

trustRouter.post("/flags", (_req, res) => {
  res.status(501).json({
    error: "not_implemented",
    hint: "Provider flags user; threshold reduces ping ability",
  });
});
