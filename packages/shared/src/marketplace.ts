/**
 * Marketplace contracts — provider discovery, service requests, pings.
 * Consumed by the API (apps/api/src/modules/marketplace) and the discovery /
 * tracking pages. Change here, never re-declare on one side.
 */

/** Canonical category slugs. Addis AI parsing maps free text onto these. */
export const SERVICE_CATEGORIES = [
  "plumber",
  "electrician",
  "carpenter",
  "cleaner",
  "painter",
  "mechanic",
  "mover",
  "gardener",
  "appliance_repair",
  "tutor",
  "other",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const URGENCY_LEVELS = ["low", "normal", "high", "emergency"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** One row of provider discovery results. No phone number until a ping is accepted. */
export interface ProviderSummary {
  id: string;
  name: string | null;
  category: string;
  bio: string | null;
  experienceYears: number;
  trustScore: number;
  isOnline: boolean;
  kycStatus: string;
  firecrawlVerified: boolean;
  lat: number;
  lng: number;
  distanceMeters: number;
  avgRating: number | null;
  reviewCount: number;
  completedContracts: number;
  lastSeenAt: string | null;
}

export type ProviderSort = "trust" | "distance";

export interface ProviderSearchQuery {
  lat: number;
  lng: number;
  radiusMeters: number;
  category: string | null;
  minTrust: number;
  onlineOnly: boolean;
  q: string | null;
  sort: ProviderSort;
  limit: number;
  offset: number;
}

export interface ProviderSearchResult {
  providers: ProviderSummary[];
  total: number;
  query: ProviderSearchQuery;
}

export interface ProviderDetail extends ProviderSummary {
  recentReviews: ProviderReviewSummary[];
}

export interface ProviderReviewSummary {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export type ServiceRequestStatusDto =
  | "pending"
  | "pinged"
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface ServiceRequestDto {
  id: string;
  userId: string;
  category: string;
  description: string | null;
  urgency: Urgency;
  lat: number;
  lng: number;
  addressLabel: string | null;
  radiusMeters: number;
  status: ServiceRequestStatusDto;
  voiceTranscript: string | null;
  nlp: VoiceParseResult | null;
  createdAt: string;
}

export type PingStatusDto = "sent" | "seen" | "accepted" | "declined";

export interface PingDto {
  id: string;
  requestId: string;
  providerId: string;
  status: PingStatusDto;
  distanceMeters: number | null;
  trustScoreAtPing: number | null;
  sentAt: string;
  seenAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
}

/** A ping as the provider sees it, with the request folded in. */
export interface ProviderPingDto extends PingDto {
  request: ServiceRequestDto;
  customerName: string | null;
}

export interface PingFanoutResult {
  request: ServiceRequestDto;
  pings: PingDto[];
  pingedProviderIds: string[];
  skipped: { providerId: string; reason: string }[];
}

/** Output of the Whisperflow -> Addis AI pipeline. */
export interface VoiceParseResult {
  category: ServiceCategory;
  urgency: Urgency;
  location: {
    label: string | null;
    lat: number | null;
    lng: number | null;
  };
  confidence: number;
  /** "addis_ai" when the model answered, "heuristic" on the offline fallback. */
  source: "addis_ai" | "heuristic";
}

export interface VoiceTranscriptResult {
  transcript: string;
  language: string | null;
  durationSeconds: number | null;
  source: "whisperflow" | "client_supplied";
}
