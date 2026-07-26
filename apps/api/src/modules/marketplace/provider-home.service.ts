import type {
  DemandSnapshot,
  ProviderDashboard,
  ProviderShiftStats,
} from "@zeyla/shared";
import { query } from "../../db/client.js";
import {
  getAvailabilityWithSeconds,
  onlineSecondsToday,
} from "./availability.service.js";
import type { Actor } from "./lib/actor.js";
import { ApiError } from "./lib/errors.js";
import { listProviderPings } from "./pings.service.js";
import { getOwnProviderProfile } from "./profile.service.js";

/**
 * The provider home screen, assembled in one round trip.
 *
 * Sits above availability and pings rather than inside either, so that
 * availability.service can stay free of marketplace dependencies and pings can
 * import it without a cycle.
 */

interface StatsRow {
  pings_today: string;
  pending_pings: string;
  accepted_today: string;
  declined_today: string;
  completed_today: string;
  earned_today: string | null;
  pending_earnings: string | null;
  earned_total: string | null;
  completed_total: string;
  avg_rating: string | null;
  review_count: string;
  answered_30d: string;
  accepted_30d: string;
}

/**
 * Today's shift in one pass over the provider's pings, with the money read from
 * the escrow ledger. Everything is counted from midnight except the acceptance
 * rate, which needs a longer window to mean anything on a provider's first day.
 */
async function readShiftStats(
  providerId: string,
  onlineSeconds: number,
): Promise<ProviderShiftStats> {
  const result = await query<StatsRow>(
    `SELECT
       COUNT(*) FILTER (WHERE p.sent_at >= date_trunc('day', now()))         AS pings_today,
       COUNT(*) FILTER (WHERE p.status IN ('sent', 'seen')
                          AND (p.expires_at IS NULL OR p.expires_at > now())) AS pending_pings,
       COUNT(*) FILTER (WHERE p.status = 'accepted'
                          AND p.responded_at >= date_trunc('day', now()))    AS accepted_today,
       COUNT(*) FILTER (WHERE p.status = 'declined'
                          AND p.responded_at >= date_trunc('day', now()))    AS declined_today,
       COUNT(*) FILTER (WHERE p.responded_at >= now() - interval '30 days'
                          AND p.status IN ('accepted', 'declined'))          AS answered_30d,
       COUNT(*) FILTER (WHERE p.responded_at >= now() - interval '30 days'
                          AND p.status = 'accepted')                         AS accepted_30d,
       (SELECT COUNT(*) FROM contracts c
         WHERE c.provider_id = $1::uuid
           AND c.status = 'completed'
           AND c.completed_at >= date_trunc('day', now()))                   AS completed_today,
       (SELECT COALESCE(SUM(l.provider_payout), 0)
          FROM escrow_ledger l
          JOIN contracts c ON c.id = l.contract_id
         WHERE c.provider_id = $1::uuid
           AND l.status = 'released'
           AND l.released_at >= date_trunc('day', now()))                    AS earned_today,
       (SELECT COALESCE(SUM(COALESCE(l.provider_payout, l.amount)), 0)
          FROM escrow_ledger l
          JOIN contracts c ON c.id = l.contract_id
         WHERE c.provider_id = $1::uuid
           AND l.status = 'held')                                            AS pending_earnings,
       (SELECT COALESCE(SUM(l.provider_payout), 0)
          FROM escrow_ledger l
          JOIN contracts c ON c.id = l.contract_id
         WHERE c.provider_id = $1::uuid
           AND l.status = 'released')                                        AS earned_total,
       (SELECT COUNT(*) FROM contracts c
         WHERE c.provider_id = $1::uuid
           AND c.status = 'completed')                                       AS completed_total,
       (SELECT AVG(rating) FROM reviews rv
         WHERE rv.provider_id = $1::uuid)                                    AS avg_rating,
       (SELECT COUNT(*) FROM reviews rv
         WHERE rv.provider_id = $1::uuid)                                    AS review_count
     FROM pings p
     WHERE p.provider_id = $1::uuid`,
    [providerId],
  );

  const row = result.rows[0];
  const answered = Number(row?.answered_30d ?? 0);
  const reviewCount = Number(row?.review_count ?? 0);

  return {
    pingsReceivedToday: Number(row?.pings_today ?? 0),
    pendingPings: Number(row?.pending_pings ?? 0),
    acceptedToday: Number(row?.accepted_today ?? 0),
    declinedToday: Number(row?.declined_today ?? 0),
    completedToday: Number(row?.completed_today ?? 0),
    earnedTodayEtb: Number(row?.earned_today ?? 0),
    pendingEarningsEtb: Number(row?.pending_earnings ?? 0),
    earnedTotalEtb: Number(row?.earned_total ?? 0),
    completedTotal: Number(row?.completed_total ?? 0),
    avgRating:
      reviewCount === 0 ? null : Math.round(Number(row?.avg_rating ?? 0) * 10) / 10,
    reviewCount,
    acceptanceRate:
      answered === 0
        ? null
        : Math.round((Number(row?.accepted_30d ?? 0) / answered) * 100),
    onlineSecondsToday: onlineSeconds,
  };
}

/**
 * What is out there right now, whether or not this provider was pinged for it.
 *
 * This is the honest argument for going online: an offline provider sees the
 * work they are not being offered and how many rivals are online to take it,
 * counted from their own base point and radius. Requests older than two hours
 * are dropped — a stale "pending" row is not real demand.
 */
async function readDemand(providerId: string): Promise<DemandSnapshot> {
  const result = await query<{
    open_requests: string;
    competing_providers: string;
    radius_meters: number | null;
  }>(
    `WITH me AS (
       SELECT user_id, category, location, service_radius_meters
         FROM providers WHERE user_id = $1::uuid
     )
     SELECT
       (SELECT COUNT(*)
          FROM service_requests r, me
         WHERE r.status IN ('pending', 'pinged')
           AND r.created_at >= now() - interval '2 hours'
           AND me.location IS NOT NULL
           AND ST_DWithin(r.location, me.location, me.service_radius_meters)
           AND lower(r.category) = lower(me.category))          AS open_requests,
       (SELECT COUNT(*)
          FROM providers o, me
         WHERE o.user_id <> me.user_id
           AND o.availability_status = 'online'
           AND o.location IS NOT NULL
           AND me.location IS NOT NULL
           AND ST_DWithin(o.location, me.location, me.service_radius_meters)
           AND lower(o.category) = lower(me.category))          AS competing_providers,
       (SELECT service_radius_meters FROM me)                   AS radius_meters`,
    [providerId],
  );

  const row = result.rows[0];
  return {
    openRequests: Number(row?.open_requests ?? 0),
    competingProviders: Number(row?.competing_providers ?? 0),
    radiusMeters: Number(row?.radius_meters ?? 0),
  };
}

export async function getProviderDashboard(
  actor: Actor,
): Promise<ProviderDashboard> {
  const provider = await getOwnProviderProfile(actor);
  if (!provider) throw ApiError.notFound("provider_profile");

  // Every panel dates from the same midnight, so the figures cannot disagree
  // across a boundary crossed mid-request.
  const seconds = await onlineSecondsToday(actor.userId);

  const [availability, stats, demand, inbox] = await Promise.all([
    getAvailabilityWithSeconds(actor.userId, seconds),
    readShiftStats(actor.userId, seconds),
    readDemand(actor.userId),
    listProviderPings(actor, { limit: 20 }),
  ]);

  return { provider, availability, stats, demand, inbox };
}
