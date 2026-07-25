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

/** Addis Ababa sub-cities, as the onboarding provider form offers them. */
export const SUB_CITIES = [
  "Addis Ketema",
  "Akaky Kaliti",
  "Arada",
  "Bole",
  "Gullele",
  "Kirkos",
  "Kolfe Keranio",
  "Lideta",
  "Nifas Silk-Lafto",
  "Yeka",
] as const;

export type SubCity = (typeof SUB_CITIES)[number];

/**
 * Body of POST /api/marketplace/providers — the provider profile created at the
 * end of onboarding. Idempotent: posting again updates the existing profile.
 */
export interface ProviderProfileInput {
  category: ServiceCategory;
  businessName: string;
  subCity: SubCity;
  bio: string;
  experienceYears: number;
  priceMin: number;
  priceMax: number;
  /** Published work number, which need not be the login phone. */
  contactPhone?: string;
  /** Display name written back to the user record when supplied. */
  fullName?: string;
  serviceRadiusMeters?: number;
  /**
   * Exact base location. Omit and the sub-city centroid is used, so a provider
   * is always findable by the PostGIS radius search either way.
   */
  lat?: number;
  lng?: number;
}

export interface ProviderProfile {
  providerId: string;
  category: string;
  businessName: string | null;
  subCity: string | null;
  bio: string | null;
  experienceYears: number;
  priceMin: number | null;
  priceMax: number | null;
  contactPhone: string | null;
  serviceRadiusMeters: number;
  trustScore: number;
  isOnline: boolean;
  lat: number | null;
  lng: number | null;
  createdFromSubCityCentroid: boolean;
}

export interface ProviderProfileResponse {
  provider: ProviderProfile;
  /** False when the post updated a profile that already existed. */
  created: boolean;
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

/** Languages a customer may speak: English, Amharic, Afaan Oromo. */
export const SPOKEN_LANGUAGES = ["en", "am", "om"] as const;
export type SpokenLanguage = (typeof SPOKEN_LANGUAGES)[number];

/**
 * Output of the Addis AI -> Gemini pipeline: what the customer asked for, in a
 * shape the matcher can act on.
 */
export interface VoiceParseResult {
  category: ServiceCategory;
  urgency: Urgency;
  location: {
    label: string | null;
    lat: number | null;
    lng: number | null;
  };
  confidence: number;
  /** Which stage produced this — Gemini, Addis AI's chat model, or the offline parser. */
  source: "gemini" | "addis_ai" | "heuristic";
  /** Language Gemini judged the transcript to be in, independent of any client hint. */
  detectedLanguage: SpokenLanguage | null;
  /** English translation, so providers and staff read one language. */
  summaryEn: string | null;
  /** One line back in the customer's own language, for the confirm screen. */
  summaryLocal: string | null;
  /** Symptom keywords used to rank providers. */
  keywords: string[];
}

export interface VoiceTranscriptResult {
  transcript: string;
  language: string | null;
  durationSeconds: number | null;
  source: "addis_ai" | "whisperflow" | "client_supplied";
  /** STT self-reported confidence, when the provider returns one. */
  confidence: number | null;
}

/** One ranked provider, with the reason it placed where it did. */
export interface ProviderMatch {
  provider: ProviderSummary;
  /** 0-100. Blends Gemini's fit judgement with trust and distance. */
  score: number;
  /** Short sentence the customer sees under the provider's name. */
  reason: string;
  rank: number;
}

export interface MatchResult {
  request: ServiceRequestDto;
  matches: ProviderMatch[];
  /** "gemini" when the model ranked them, "deterministic" on trust+distance only. */
  source: "gemini" | "deterministic";
}
