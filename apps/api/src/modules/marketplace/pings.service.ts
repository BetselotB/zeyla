import type {
  PingDto,
  PingFanoutResult,
  PingStatusDto,
  ProviderPingDto,
  ServiceRequestDto,
  VoiceParseResult,
} from "@zeyla/shared";
import { REALTIME_EVENTS } from "@zeyla/shared";
import { query } from "../../db/client.js";
import { emitToProvider, emitToUser } from "../realtime/io.js";
import type { Actor } from "./lib/actor.js";
import { ApiError } from "./lib/errors.js";
import {
  getOwnedServiceRequest,
  getServiceRequest,
  setRequestStatus,
  toRequestDto,
} from "./requests.service.js";

interface PingRow {
  id: string;
  request_id: string;
  provider_id: string;
  status: string;
  distance_meters: string | number | null;
  trust_score_at_ping: string | null;
  sent_at: Date;
  seen_at: Date | null;
  responded_at: Date | null;
  expires_at: Date | null;
}

const PING_COLUMNS = `
  id, request_id, provider_id, status, distance_meters, trust_score_at_ping,
  sent_at, seen_at, responded_at, expires_at`;

function toPingDto(row: PingRow): PingDto {
  return {
    id: row.id,
    requestId: row.request_id,
    providerId: row.provider_id,
    status: row.status as PingStatusDto,
    distanceMeters:
      row.distance_meters === null ? null : Math.round(Number(row.distance_meters)),
    trustScoreAtPing:
      row.trust_score_at_ping === null ? null : Number(row.trust_score_at_ping),
    sentAt: row.sent_at.toISOString(),
    seenAt: row.seen_at?.toISOString() ?? null,
    respondedAt: row.responded_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
  };
}

export interface FanoutOptions {
  providerIds?: string[];
  maxProviders: number;
  minTrust: number;
  radiusMeters?: number;
  onlineOnly: boolean;
  expiresInSeconds: number;
}

/**
 * Ping nearby providers about a request.
 *
 * The candidate pick and the insert are one statement, so two customers racing
 * on the same request cannot double-ping a provider — `pings` is unique on
 * (request_id, provider_id) and the conflict is swallowed.
 */
export async function fanoutPings(
  actor: Actor,
  requestId: string,
  options: FanoutOptions,
): Promise<PingFanoutResult> {
  const request = await getOwnedServiceRequest(actor, requestId);

  if (request.status !== "pending" && request.status !== "pinged") {
    throw ApiError.conflict("request_not_open", { status: request.status });
  }

  const explicit = options.providerIds && options.providerIds.length > 0;

  const sql = explicit
    ? `WITH req AS (
         SELECT id, location FROM service_requests WHERE id = $1::uuid
       ),
       chosen AS (
         SELECT p.user_id,
                p.trust_score,
                ST_Distance(p.location, r.location) AS distance_meters
           FROM providers p
           CROSS JOIN req r
          WHERE p.user_id = ANY($2::uuid[])
       )
       INSERT INTO pings (request_id, provider_id, distance_meters,
                          trust_score_at_ping, expires_at)
       SELECT (SELECT id FROM req), user_id, distance_meters, trust_score,
              now() + make_interval(secs => $3::int)
         FROM chosen
       ON CONFLICT (request_id, provider_id) DO NOTHING
       RETURNING ${PING_COLUMNS}`
    : `WITH req AS (
         SELECT id, location, category, radius_meters
           FROM service_requests WHERE id = $1::uuid
       ),
       candidates AS (
         SELECT p.user_id,
                p.trust_score,
                ST_Distance(p.location, r.location) AS distance_meters
           FROM providers p
           CROSS JOIN req r
          WHERE p.location IS NOT NULL
            AND ST_DWithin(p.location, r.location,
                           COALESCE($4::float8, r.radius_meters))
            AND lower(p.category) = lower(r.category)
            AND p.trust_score >= $5::numeric
            AND ($6::boolean = false OR p.is_online = true)
            AND NOT EXISTS (
                  SELECT 1 FROM pings x
                   WHERE x.request_id = r.id AND x.provider_id = p.user_id
                )
          ORDER BY p.trust_score DESC, distance_meters ASC
          LIMIT $2::int
       )
       INSERT INTO pings (request_id, provider_id, distance_meters,
                          trust_score_at_ping, expires_at)
       SELECT (SELECT id FROM req), user_id, distance_meters, trust_score,
              now() + make_interval(secs => $3::int)
         FROM candidates
       ON CONFLICT (request_id, provider_id) DO NOTHING
       RETURNING ${PING_COLUMNS}`;

  const params = explicit
    ? [requestId, options.providerIds, options.expiresInSeconds]
    : [
        requestId,
        options.maxProviders,
        options.expiresInSeconds,
        options.radiusMeters ?? null,
        options.minTrust,
        options.onlineOnly,
      ];

  const inserted = await query<PingRow>(sql, params);
  const pings = inserted.rows.map(toPingDto);

  const skipped: PingFanoutResult["skipped"] = [];
  if (explicit) {
    const pinged = new Set(pings.map((p) => p.providerId));
    const existing = await query<{ provider_id: string }>(
      `SELECT provider_id FROM pings WHERE request_id = $1::uuid AND provider_id = ANY($2::uuid[])`,
      [requestId, options.providerIds],
    );
    const known = new Set(existing.rows.map((r) => r.provider_id));
    for (const id of options.providerIds!) {
      if (pinged.has(id)) continue;
      skipped.push({
        providerId: id,
        reason: known.has(id) ? "already_pinged" : "unknown_provider",
      });
    }
  }

  const updated =
    pings.length > 0 && request.status === "pending"
      ? await setRequestStatus(requestId, "pinged")
      : request;

  if (pings.length > 0) {
    const customerName = await getUserName(updated.userId);
    for (const ping of pings) {
      emitToProvider(ping.providerId, REALTIME_EVENTS.PING_INCOMING, {
        ...ping,
        request: updated,
        customerName,
      } satisfies ProviderPingDto);
    }
  }

  return {
    request: updated,
    pings,
    pingedProviderIds: pings.map((p) => p.providerId),
    skipped,
  };
}

async function getUserName(userId: string): Promise<string | null> {
  const result = await query<{ name: string | null }>(
    "SELECT name FROM users WHERE id = $1::uuid",
    [userId],
  );
  return result.rows[0]?.name ?? null;
}

/** Ping joined to its request — every request column is aliased `r_*` so it
 *  cannot collide with the ping's own id/status. */
type ProviderPingRow = PingRow & {
  r_id: string;
  r_user_id: string;
  r_category: string;
  r_description: string | null;
  r_urgency: string;
  r_lat: number;
  r_lng: number;
  r_address_label: string | null;
  r_radius_meters: number;
  r_status: string;
  r_voice_transcript: string | null;
  r_nlp: VoiceParseResult | null;
  r_created_at: Date;
  customer_name: string | null;
};

/** The provider's inbox. */
export async function listProviderPings(
  actor: Actor,
  filters: { status?: PingStatusDto; limit: number },
): Promise<ProviderPingDto[]> {
  const result = await query<ProviderPingRow>(
    `SELECT p.id, p.request_id, p.provider_id, p.status, p.distance_meters,
            p.trust_score_at_ping, p.sent_at, p.seen_at, p.responded_at, p.expires_at,
            r.id            AS r_id,
            r.user_id       AS r_user_id,
            r.category      AS r_category,
            r.description   AS r_description,
            r.urgency       AS r_urgency,
            r.lat           AS r_lat,
            r.lng           AS r_lng,
            r.address_label AS r_address_label,
            r.radius_meters AS r_radius_meters,
            r.status        AS r_status,
            r.voice_transcript AS r_voice_transcript,
            r.nlp           AS r_nlp,
            r.created_at    AS r_created_at,
            u.name          AS customer_name
       FROM pings p
       JOIN service_requests r ON r.id = p.request_id
       JOIN users u ON u.id = r.user_id
      WHERE p.provider_id = $1::uuid
        AND ($2::text IS NULL OR p.status::text = $2::text)
      ORDER BY p.sent_at DESC
      LIMIT $3::int`,
    [actor.userId, filters.status ?? null, filters.limit],
  );

  return result.rows.map((row) => ({
    ...toPingDto(row),
    request: toRequestDto({
      id: row.r_id,
      user_id: row.r_user_id,
      category: row.r_category,
      description: row.r_description,
      urgency: row.r_urgency,
      lat: row.r_lat,
      lng: row.r_lng,
      address_label: row.r_address_label,
      radius_meters: row.r_radius_meters,
      status: row.r_status,
      voice_transcript: row.r_voice_transcript,
      nlp: row.r_nlp,
      created_at: row.r_created_at,
    }),
    customerName: row.customer_name,
  }));
}

export interface PingResponseResult {
  ping: PingDto;
  request: ServiceRequestDto;
}

/**
 * Provider answers a ping. Accepting moves the request to `accepted` and tells
 * the customer over their socket room; creating the contract and escrow row is
 * the escrow module's job, triggered from the customer side.
 */
export async function respondToPing(
  actor: Actor,
  pingId: string,
  action: "seen" | "accepted" | "declined",
): Promise<PingResponseResult> {
  const current = await query<PingRow>(
    `SELECT ${PING_COLUMNS} FROM pings WHERE id = $1::uuid`,
    [pingId],
  );
  const row = current.rows[0];
  if (!row || row.provider_id !== actor.userId) throw ApiError.notFound("ping");

  if (row.status === "accepted" || row.status === "declined") {
    throw ApiError.conflict("ping_already_answered", { status: row.status });
  }
  if (
    action === "accepted" &&
    row.expires_at &&
    row.expires_at.getTime() < Date.now()
  ) {
    throw ApiError.conflict("ping_expired", {
      expiresAt: row.expires_at.toISOString(),
    });
  }

  const updated = await query<PingRow>(
    `UPDATE pings
        SET status = $2::ping_status,
            seen_at = COALESCE(seen_at, now()),
            responded_at = CASE WHEN $2 IN ('accepted', 'declined')
                                THEN now() ELSE responded_at END
      WHERE id = $1::uuid
      RETURNING ${PING_COLUMNS}`,
    [pingId, action],
  );
  const ping = toPingDto(updated.rows[0]!);

  let request = await getServiceRequest(ping.requestId);
  if (action === "accepted") {
    if (request.status !== "pending" && request.status !== "pinged") {
      throw ApiError.conflict("request_not_open", { status: request.status });
    }
    request = await setRequestStatus(ping.requestId, "accepted");
  }

  emitToUser(request.userId, REALTIME_EVENTS.PING_ANSWERED, {
    pingId: ping.id,
    requestId: ping.requestId,
    providerId: ping.providerId,
    providerName: await getUserName(ping.providerId),
    status: action,
    answeredAt: ping.respondedAt ?? new Date().toISOString(),
  });

  return { ping, request };
}

/** Every ping raised for a request — the customer's "who did we ask" view. */
export async function listRequestPings(requestId: string): Promise<PingDto[]> {
  const result = await query<PingRow>(
    `SELECT ${PING_COLUMNS} FROM pings WHERE request_id = $1::uuid ORDER BY sent_at ASC`,
    [requestId],
  );
  return result.rows.map(toPingDto);
}
