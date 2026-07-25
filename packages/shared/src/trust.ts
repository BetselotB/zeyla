/**
 * Trust, reviews and flags contracts.
 * The formula itself lives in index.ts (`computeTrustScore`).
 */

import type { TrustScoreBreakdown } from "./index.js";

/** One line of the on-screen "why this score" panel. */
export interface TrustFactor {
  key:
    | "base"
    | "completed_contracts"
    | "reviews"
    | "kyc"
    | "firecrawl"
    | "flags";
  label: string;
  points: number;
  detail: string;
}

export interface TrustExplanation {
  headline: string;
  summary: string;
  factors: TrustFactor[];
  /** "template" is the deterministic text; "addis_ai" is the model rewrite. */
  source: "template" | "addis_ai";
}

export interface TrustStats {
  completedContracts: number;
  avgRating: number | null;
  reviewCount: number;
  flagsReceived: number;
  kycSubmitted: boolean;
  firecrawlMatched: boolean;
}

export interface ProviderTrustDto {
  providerId: string;
  providerName: string | null;
  trustScore: number;
  breakdown: TrustScoreBreakdown;
  stats: TrustStats;
  explanation: TrustExplanation;
}

export interface TrustLogEntryDto {
  id: string;
  delta: number;
  reason: string;
  previousScore: number | null;
  newScore: number | null;
  createdAt: string;
}

export interface ReviewDto {
  id: string;
  contractId: string;
  providerId: string;
  reviewerUserId: string | null;
  rating: number;
  comment: string | null;
  voiceUrl: string | null;
  transcriptSource: string | null;
  createdAt: string;
}

export type FlagStatus = "open" | "upheld" | "dismissed";

export interface FlagDto {
  id: string;
  targetProviderId: string | null;
  flaggedUserId: string | null;
  reporterUserId: string | null;
  contractId: string | null;
  reason: string | null;
  status: FlagStatus;
  createdAt: string;
}
