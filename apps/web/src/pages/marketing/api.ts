import type { ApiResponse, ProviderSearchResult, ProviderSummary } from "@zeyla/shared";

/**
 * The one API call the marketing pages make.
 *
 * Provider search is public, so this deliberately sends no Authorization header
 * and does not touch the session helpers — a logged-out visitor reading the
 * Providers page should never trigger a token bootstrap. Failure is not an
 * error state here either: the page falls back to its static copy.
 */
const API_BASE = `${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/api`;

/** Meskel Square. Only used to centre the public preview search. */
const ADDIS_CENTRE = { lat: 9.0107, lng: 38.7613 };

export interface ProviderPreview {
  providers: ProviderSummary[];
  total: number;
}

export async function fetchProviderPreview(limit = 6): Promise<ProviderPreview> {
  const url = new URL(`${API_BASE}/marketplace/providers`);
  url.searchParams.set("lat", String(ADDIS_CENTRE.lat));
  url.searchParams.set("lng", String(ADDIS_CENTRE.lng));
  url.searchParams.set("radiusMeters", "50000");
  url.searchParams.set("sort", "trust");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url);
  const envelope = (await res.json().catch(() => null)) as ApiResponse<ProviderSearchResult> | null;
  if (!envelope?.success || envelope.data == null) {
    throw new Error(envelope?.error ?? `request_failed_${res.status}`);
  }
  return { providers: envelope.data.providers, total: envelope.data.total };
}
