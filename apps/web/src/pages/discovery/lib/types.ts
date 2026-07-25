/**
 * Discovery view types.
 *
 * The wire shapes live in `@zeyla/shared` and are re-exported here rather than
 * redeclared, so a backend change breaks this typecheck instead of silently
 * disagreeing at runtime.
 */
export type {
  MatchResult,
  PingDto,
  ProviderMatch,
  ProviderSummary,
  ServiceRequestDto,
  SpokenLanguage,
  Urgency,
  VoiceParseResult,
  VoiceTranscriptResult,
} from "@zeyla/shared";

import type { SpokenLanguage } from "@zeyla/shared";

/** The language picker uses the same codes Addis AI transcribes. */
export type LanguageCode = SpokenLanguage;

export interface TrustBreakdown {
  base: number;
  completedContracts: number;
  reviewBonus: number;
  kycBonus: number;
  firecrawlBonus: number;
  flagPenalty: number;
  total: number;
  explanation: string;
}

// --- Mock-era shapes ---------------------------------------------------------
// Still used by the tracking and reviews pages, which run on mockData.ts. Those
// screens depend on contracts and escrow rather than on discovery, so they are
// wired separately; discovery itself no longer references anything below.

/** @deprecated Use `ProviderSummary`. */
export interface Provider {
  id: number;
  name: string;
  category: string;
  bio: string;
  location_area: string;
  languages: LanguageCode[];
  price_min: number;
  price_max: number;
  is_verified: boolean;
  is_boosted: boolean;
  avg_rating: number;
  jobs_completed: number;
  complaint_count: number;
  avg_response_minutes: number;
  trust_score: number;
  lat: number;
  lng: number;
}

/** @deprecated Use `ServiceRequestDto`. */
export interface ServiceRequest {
  id: number;
  status:
    | "draft"
    | "matched"
    | "sent"
    | "accepted"
    | "declined"
    | "completed"
    | "cancelled";
  matched_provider_id: number | null;
  service_category: string;
  summary_en: string;
  urgency: "low" | "medium" | "high";
}

/** @deprecated Use `VoiceParseResult`. */
export interface Classification {
  service_category: string;
  urgency: "low" | "medium" | "high";
  estimated_cost_min_etb: number;
  estimated_cost_max_etb: number;
  detected_language: LanguageCode;
  summary_en: string;
  summary_local: string;
  source: "ai" | "mock";
}
