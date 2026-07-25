import type { Classification, Provider, ServiceRequest, TrustBreakdown } from "./types.js";

export const MOCK_PROVIDERS: Provider[] = [
  {
    id: 1,
    name: "Abebe Kebede",
    category: "plumber",
    bio: "15 years fixing leaks, pipes, and water heaters across Addis Ababa.",
    location_area: "Bole",
    languages: ["am", "en"],
    price_min: 300,
    price_max: 900,
    is_verified: true,
    is_boosted: true,
    avg_rating: 4.8,
    jobs_completed: 34,
    complaint_count: 0,
    avg_response_minutes: 12,
    trust_score: 91,
    lat: 8.9806,
    lng: 38.7578,
  },
  {
    id: 2,
    name: "Hanna Tadesse",
    category: "plumber",
    bio: "Certified plumber specializing in kitchen and bathroom repairs.",
    location_area: "Kazanchis",
    languages: ["am", "en", "om"],
    price_min: 250,
    price_max: 750,
    is_verified: true,
    is_boosted: false,
    avg_rating: 4.5,
    jobs_completed: 22,
    complaint_count: 1,
    avg_response_minutes: 18,
    trust_score: 84,
    lat: 9.0123,
    lng: 38.7612,
  },
  {
    id: 3,
    name: "Dawit Mekonnen",
    category: "plumber",
    bio: "Fast response, transparent pricing. Available evenings and weekends.",
    location_area: "Piassa",
    languages: ["am"],
    price_min: 200,
    price_max: 600,
    is_verified: false,
    is_boosted: false,
    avg_rating: 4.2,
    jobs_completed: 11,
    complaint_count: 0,
    avg_response_minutes: 25,
    trust_score: 72,
    lat: 9.0345,
    lng: 38.7489,
  },
];

export function mockClassify(text: string): Classification {
  const lower = text.toLowerCase();
  const isPlumbing =
    lower.includes("sink") ||
    lower.includes("leak") ||
    lower.includes("pipe") ||
    lower.includes("plumb");
  const isElectrical =
    lower.includes("electric") ||
    lower.includes("power") ||
    lower.includes("wire");
  const isUrgent =
    lower.includes("urgent") ||
    lower.includes("emergency") ||
    lower.includes("flooding");

  return {
    service_category: isPlumbing
      ? "plumber"
      : isElectrical
        ? "electrician"
        : "general",
    urgency: isUrgent ? "high" : "medium",
    estimated_cost_min_etb: isPlumbing ? 400 : 300,
    estimated_cost_max_etb: isPlumbing ? 1200 : 900,
    detected_language: "en",
    summary_en: text.slice(0, 120) || "General service request",
    summary_local: text.slice(0, 120) || "General service request",
    source: "mock",
  };
}

let nextRequestId = 100;

export function mockCreateRequest(
  classification: Classification,
): ServiceRequest {
  return {
    id: nextRequestId++,
    status: "draft",
    matched_provider_id: null,
    service_category: classification.service_category,
    summary_en: classification.summary_en,
    urgency: classification.urgency,
  };
}

export function mockMatchProvider(
  requestId: number,
  providerId: number,
): ServiceRequest {
  return {
    id: requestId,
    status: "sent",
    matched_provider_id: providerId,
    service_category: "plumber",
    summary_en: "Kitchen sink leaking",
    urgency: "high",
  };
}

export function mockGetRequest(id: number): ServiceRequest {
  return {
    id,
    status: "accepted",
    matched_provider_id: 1,
    service_category: "plumber",
    summary_en: "Kitchen sink leaking",
    urgency: "high",
  };
}

export function mockTrustBreakdown(providerId: number): TrustBreakdown {
  const provider = MOCK_PROVIDERS.find((p) => p.id === providerId);
  return {
    base: 50,
    completedContracts: Math.min((provider?.jobs_completed ?? 0) * 2, 20),
    reviewBonus: provider ? ((provider.avg_rating - 1) / 4) * 20 : 10,
    kycBonus: provider?.is_verified ? 10 : 0,
    firecrawlBonus: 0,
    flagPenalty: (provider?.complaint_count ?? 0) * -5,
    total: provider?.trust_score ?? 75,
    explanation: `Trust score reflects ${provider?.jobs_completed ?? 0} completed jobs, ${provider?.avg_rating ?? 4}★ average rating, ${provider?.is_verified ? "verified KYC" : "pending verification"}, and ${provider?.complaint_count ?? 0} complaints.`,
  };
}
