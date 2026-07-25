import type { MatchResult, PingFanoutResult, ProviderMatch } from "@zeyla/shared";
import { describeFallback, rankProviders } from "./ai/gemini.js";
import { searchProviders } from "./discovery.service.js";
import type { Actor } from "./lib/actor.js";
import { ApiError } from "./lib/errors.js";
import { fanoutPings } from "./pings.service.js";
import { getOwnedServiceRequest } from "./requests.service.js";

/**
 * Pairing a customer with providers.
 *
 * Two layers, deliberately separated:
 *
 *   Hard constraints run in SQL (discovery.service). Right trade, inside the
 *   customer's radius, above the trust floor. These are not negotiable and a
 *   model never sees them, so no model mistake can surface an ineligible
 *   provider — the worst it can do is order a legitimate shortlist badly.
 *
 *   Soft ranking runs in Gemini. Of the providers who *could* take this job,
 *   which one actually fits the problem the customer described, and why. That
 *   "why" is what the customer reads next to each name.
 *
 * With Gemini unreachable the SQL order (trust, then distance) stands and each
 * provider gets a factual one-liner instead of a written reason.
 */

/** Wider than the customer's own radius floor: an empty result is worse than a far one. */
const MIN_SEARCH_RADIUS_METERS = 3_000;
const CANDIDATE_LIMIT = 12;

export interface MatchOptions {
  limit: number;
  onlineOnly: boolean;
  minTrust: number;
}

export async function matchProviders(
  actor: Actor,
  requestId: string,
  options: MatchOptions,
): Promise<MatchResult> {
  const request = await getOwnedServiceRequest(actor, requestId);

  const { providers } = await searchProviders({
    lat: request.lat,
    lng: request.lng,
    radiusMeters: Math.max(request.radiusMeters, MIN_SEARCH_RADIUS_METERS),
    // "other" means the parse could not name a trade. Filtering on it would
    // return nobody, so widen to every trade and let the ranking sort it out.
    category: request.category === "other" ? null : request.category,
    minTrust: options.minTrust,
    onlineOnly: options.onlineOnly,
    q: null,
    sort: "trust",
    limit: CANDIDATE_LIMIT,
    offset: 0,
  });

  if (providers.length === 0) {
    return { request, matches: [], source: "deterministic" };
  }

  const ranked = await rankProviders(request, providers);
  const matches: ProviderMatch[] =
    ranked ??
    providers.map((provider, index) => ({
      provider,
      // Mirrors the SQL order so the two paths cannot disagree about who is best.
      score: Math.round(provider.trustScore),
      reason: describeFallback(provider),
      rank: index + 1,
    }));

  return {
    request,
    matches: matches.slice(0, options.limit),
    source: ranked ? "gemini" : "deterministic",
  };
}

export interface PairResult extends PingFanoutResult {
  /** How the paired providers were chosen, and why each one. */
  matches: ProviderMatch[];
  matchSource: MatchResult["source"];
}

/**
 * Commit to a pairing: ping the chosen provider, or the best-ranked ones.
 *
 * `providerId` is the customer tapping a specific name. Without it we ping the
 * top `limit` of the ranked shortlist, which is the fast path for an emergency
 * where nobody wants to read profiles.
 */
export async function pairRequestWithProvider(
  actor: Actor,
  requestId: string,
  input: { providerId?: string; limit: number; onlineOnly: boolean; minTrust: number },
): Promise<PairResult> {
  const { request, matches, source } = await matchProviders(actor, requestId, {
    limit: input.providerId ? CANDIDATE_LIMIT : input.limit,
    onlineOnly: input.onlineOnly,
    minTrust: input.minTrust,
  });

  let chosen: ProviderMatch[];
  if (input.providerId) {
    const picked = matches.find((m) => m.provider.id === input.providerId);
    if (!picked) {
      // Either not a provider, or outside the radius / trade for this request.
      throw ApiError.badRequest("provider_not_eligible", {
        providerId: input.providerId,
        hint: "Provider is not in range, not this trade, or below the trust floor.",
      });
    }
    chosen = [picked];
  } else {
    chosen = matches.slice(0, input.limit);
  }

  if (chosen.length === 0) {
    throw ApiError.notFound("matching_provider");
  }

  const fanout = await fanoutPings(actor, request.id, {
    providerIds: chosen.map((m) => m.provider.id),
    maxProviders: chosen.length,
    minTrust: input.minTrust,
    onlineOnly: input.onlineOnly,
    expiresInSeconds: request.urgency === "emergency" ? 120 : 300,
  });

  return { ...fanout, matches: chosen, matchSource: source };
}
