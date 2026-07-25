export type LanguageCode = "en" | "am" | "om";

export type Urgency = "low" | "medium" | "high";

export interface Classification {
  service_category: string;
  urgency: Urgency;
  estimated_cost_min_etb: number;
  estimated_cost_max_etb: number;
  detected_language: LanguageCode;
  summary_en: string;
  summary_local: string;
  source: "ai" | "mock";
}

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
  urgency: Urgency;
}

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
