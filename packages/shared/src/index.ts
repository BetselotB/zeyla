/** Shared domain types — keep API + web in sync */

export * from "./marketplace.js";

/** Every Zeyla endpoint answers in this envelope. See .cursorrules. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export type UserRole = "user" | "provider";
export type KycStatus = "pending" | "verified" | "manual_review" | "rejected";

export type RequestStatus =
  | "pending"
  | "pinged"
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelled";

export type PingStatus = "sent" | "seen" | "accepted" | "declined";

/** Core escrow / contract state machine — Zeyla's core IP */
export type ContractStatus =
  | "awaiting_escrow"
  | "escrowed"
  | "active"
  | "completed"
  | "disputed";

export type EscrowStatus = "pending" | "held" | "released" | "refunded";

export interface TrustScoreBreakdown {
  base: number;
  completedContracts: number;
  reviewBonus: number;
  kycBonus: number;
  firecrawlBonus: number;
  flagPenalty: number;
  total: number;
}

/** Demo trust formula from architecture outline */
export const TRUST_SCORE = {
  BASE: 50,
  PER_COMPLETED_CONTRACT: 2,
  COMPLETED_CAP: 20,
  REVIEW_MAX: 20,
  KYC_VERIFIED: 10,
  FIRECRAWL_MATCH: 5,
  PER_FLAG: -5,
  FLOOR: 0,
} as const;

export function computeTrustScore(input: {
  completedContracts: number;
  avgRating: number | null;
  kycVerified: boolean;
  firecrawlMatched: boolean;
  flagsReceived: number;
}): TrustScoreBreakdown {
  const completedContracts = Math.min(
    input.completedContracts * TRUST_SCORE.PER_COMPLETED_CONTRACT,
    TRUST_SCORE.COMPLETED_CAP,
  );
  const reviewBonus =
    input.avgRating == null
      ? 0
      : ((input.avgRating - 1) / 4) * TRUST_SCORE.REVIEW_MAX;
  const kycBonus = input.kycVerified ? TRUST_SCORE.KYC_VERIFIED : 0;
  const firecrawlBonus = input.firecrawlMatched
    ? TRUST_SCORE.FIRECRAWL_MATCH
    : 0;
  const flagPenalty = input.flagsReceived * TRUST_SCORE.PER_FLAG;
  const raw =
    TRUST_SCORE.BASE +
    completedContracts +
    reviewBonus +
    kycBonus +
    firecrawlBonus +
    flagPenalty;
  const total = Math.max(TRUST_SCORE.FLOOR, Math.round(raw * 100) / 100);

  return {
    base: TRUST_SCORE.BASE,
    completedContracts,
    reviewBonus,
    kycBonus,
    firecrawlBonus,
    flagPenalty,
    total,
  };
}
