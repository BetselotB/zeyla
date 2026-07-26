import type {
  AvailabilitySource,
  AvailabilityStatus,
  HeartbeatInput,
  NearbyAvailability,
  ProviderAvailability,
  SetAvailabilityInput,
} from "@zeyla/shared";
import { REALTIME_EVENTS } from "@zeyla/shared";
import { pool, query } from "../../db/client.js";
import { emitToRooms, providerRoom, userRoom } from "../realtime/io.js";
import { ApiError } from "./lib/errors.js";

/**
 * Provider availability.
 *
 * One rule underpins everything here: `providers.is_online` — which discovery
 * and the ping fan-out filter on — is a projection of `availability_status`,
 * enforced by a trigger (migration 007). Going on the radar is therefore always
 * a deliberate act rather than a side effect of having a socket open, and
 * turning it off is enough on its own to stop being pinged.
 *
 * Three states rather than a boolean, because "on a job" and "not working" both
 * mean "do not ping me" but must not look the same to the provider:
 *
 *   offline — not working. Invisible to search, receives nothing.
 *   online  — taking work. Discoverable, pinged.
 *   busy    — mid-job. Hidden from new work, but the shift is still running.
 *
 * This module deliberately depends on nothing else in the marketplace: pings
 * and the dashboard import it, not the other way round.
 */

interface AvailabilityRow {
  user_id: string;
  availability_status: string;
  availability_source: string;
  service_radius_meters: number;
  went_online_at: Date | null;
  last_seen_at: Date | null;
  lat: number | null;
  lng: number | null;
}

const AVAILABILITY_SELECT = `
  p.user_id, p.availability_status, p.availability_source,
  p.service_radius_meters, p.went_online_at, p.last_seen_at,
  ST_Y(p.location::geometry) AS lat,
  ST_X(p.location::geometry) AS lng`;

function toAvailability(
  row: AvailabilityRow,
  onlineSeconds: number,
): ProviderAvailability {
  const status = row.availability_status as AvailabilityStatus;
  return {
    providerId: row.user_id,
    status,
    isDiscoverable: status === "online",
    source: row.availability_source as AvailabilitySource,
    serviceRadiusMeters: row.service_radius_meters,
    lat: row.lat,
    lng: row.lng,
    wentOnlineAt: row.went_online_at?.toISOString() ?? null,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    onlineSecondsToday: onlineSeconds,
  };
}

async function readAvailabilityRow(providerId: string): Promise<AvailabilityRow> {
  const result = await query<AvailabilityRow>(
    `SELECT ${AVAILABILITY_SELECT} FROM providers p WHERE p.user_id = $1::uuid`,
    [providerId],
  );
  const row = result.rows[0];
  if (!row) throw ApiError.notFound("provider_profile");
  return row;
}

/**
 * Seconds spent online or busy since midnight, derived from the transition log
 * rather than kept in a counter, so a crash mid-shift cannot lose or
 * double-count the time.
 *
 * Each log row is paired with the one after it. The stretch is clamped to
 * today, so a shift that began yesterday contributes only the part inside it,
 * and a stretch still open runs to `now()`.
 */
export async function onlineSecondsToday(providerId: string): Promise<number> {
  const result = await query<{ seconds: string | null }>(
    `WITH stretches AS (
       SELECT status,
              created_at AS started_at,
              LEAD(created_at) OVER (ORDER BY created_at) AS ended_at
         FROM provider_availability_log
        WHERE provider_id = $1::uuid
          AND created_at >= date_trunc('day', now()) - interval '1 day'
     )
     SELECT COALESCE(SUM(
              EXTRACT(EPOCH FROM (
                LEAST(COALESCE(ended_at, now()), now())
                - GREATEST(started_at, date_trunc('day', now()))
              ))
            ), 0) AS seconds
       FROM stretches
      WHERE status <> 'offline'
        AND COALESCE(ended_at, now()) > date_trunc('day', now())`,
    [providerId],
  );
  return Math.max(0, Math.round(Number(result.rows[0]?.seconds ?? 0)));
}

export async function getAvailability(
  providerId: string,
): Promise<ProviderAvailability> {
  const [row, seconds] = await Promise.all([
    readAvailabilityRow(providerId),
    onlineSecondsToday(providerId),
  ]);
  return toAvailability(row, seconds);
}

/** Same read, reusing an online-seconds figure the caller already has. */
export async function getAvailabilityWithSeconds(
  providerId: string,
  seconds: number,
): Promise<ProviderAvailability> {
  return toAvailability(await readAvailabilityRow(providerId), seconds);
}

/**
 * Flip the switch.
 *
 * The status write and the log row are one transaction: a shift recorded but
 * not applied (or the reverse) would make the online-hours figure disagree with
 * what customers could actually see.
 *
 * Idempotent — re-sending the current status refreshes the position and the
 * heartbeat without opening a second stretch in the log, so a client retrying a
 * dropped toggle cannot inflate the provider's hours.
 */
export async function setAvailability(
  providerId: string,
  input: SetAvailabilityInput,
  source: AvailabilitySource = "provider",
): Promise<ProviderAvailability> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const before = await client.query<{ availability_status: string }>(
      "SELECT availability_status FROM providers WHERE user_id = $1::uuid FOR UPDATE",
      [providerId],
    );
    const previous = before.rows[0]?.availability_status;
    if (previous === undefined) throw ApiError.notFound("provider_profile");

    const hasPoint = input.lat !== undefined && input.lng !== undefined;
    const lat = hasPoint ? input.lat : null;
    const lng = hasPoint ? input.lng : null;

    // base_lat/base_lng feed the indexed geography column through the
    // providers_sync_location trigger, so writing them is what actually moves
    // the provider into (or out of) a customer's radius.
    await client.query(
      `UPDATE providers
          SET availability_status = $2::text,
              availability_source = $3::text,
              service_radius_meters = COALESCE($4::int, service_radius_meters),
              base_lat = COALESCE($5::float8, base_lat),
              base_lng = COALESCE($6::float8, base_lng),
              current_lat = COALESCE($5::float8, current_lat),
              current_lng = COALESCE($6::float8, current_lng),
              last_seen_at = now()
        WHERE user_id = $1::uuid`,
      [providerId, input.status, source, input.serviceRadiusMeters ?? null, lat, lng],
    );

    if (previous !== input.status) {
      await client.query(
        `INSERT INTO provider_availability_log
           (provider_id, previous_status, status, source, lat, lng)
         VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::float8, $6::float8)`,
        [providerId, previous, input.status, source, lat, lng],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const availability = await getAvailability(providerId);
  announce(availability);
  return availability;
}

/**
 * Tell every tab this provider has open, so two devices cannot disagree about
 * whether the shift is running.
 *
 * Both rooms, in one emit. The user room is needed because a provider who has
 * never gone online is not in the provider room and would otherwise never hear
 * that the server switched them to busy; unioning the rooms rather than
 * emitting twice is what stops a socket that is in both from being told twice.
 */
function announce(availability: ProviderAvailability): void {
  emitToRooms(
    [providerRoom(availability.providerId), userRoom(availability.providerId)],
    REALTIME_EVENTS.PRESENCE_CHANGED,
    {
      providerId: availability.providerId,
      isOnline: availability.isDiscoverable,
      status: availability.status,
      source: availability.source,
      at: new Date().toISOString(),
    },
  );
}

/**
 * Keep-alive from an online provider, roughly once a minute.
 *
 * Deliberately cannot change the status — only the provider decides that. All
 * it proves is that the app is still running, which is what makes `lastSeenAt`
 * worth showing next to a provider's name.
 */
export async function heartbeat(
  providerId: string,
  input: HeartbeatInput,
): Promise<ProviderAvailability> {
  const hasPoint = input.lat !== undefined && input.lng !== undefined;
  const result = await query(
    `UPDATE providers
        SET last_seen_at = now(),
            base_lat = COALESCE($2::float8, base_lat),
            base_lng = COALESCE($3::float8, base_lng),
            current_lat = COALESCE($2::float8, current_lat),
            current_lng = COALESCE($3::float8, current_lng)
      WHERE user_id = $1::uuid`,
    [providerId, hasPoint ? input.lat : null, hasPoint ? input.lng : null],
  );
  if (result.rowCount === 0) throw ApiError.notFound("provider_profile");
  return getAvailability(providerId);
}

/**
 * Server-driven transitions around a job.
 *
 * Accepting work takes the provider off the radar, so the next customer is not
 * offered someone already committed. Neither of these may throw: the ping has
 * been accepted and the money has moved by the time they run, and availability
 * is a display concern next to that.
 */
export async function markBusy(providerId: string): Promise<void> {
  try {
    await setAvailability(providerId, { status: "busy" }, "job_accepted");
  } catch (err) {
    console.error("[availability] could not mark provider busy", err);
  }
}

/** Finishing a job returns the provider to online — but never starts a shift
 *  for someone who went offline while the job was still running. */
export async function releaseFromJob(providerId: string): Promise<void> {
  try {
    const current = await readAvailabilityRow(providerId);
    if (current.availability_status !== "busy") return;
    await setAvailability(providerId, { status: "online" }, "job_finished");
  } catch (err) {
    console.error("[availability] could not return provider to online", err);
  }
}

// --- Customer side ------------------------------------------------------------

export interface NearbyAvailabilityQuery {
  lat: number;
  lng: number;
  radiusMeters: number;
  category: string | null;
}

/**
 * How much of the market is reachable from a point right now.
 *
 * The customer-facing half of the same switch: an offline provider is counted
 * in `total` but not in `online`, which is what lets the intake screen say
 * "nobody is online for this trade yet" instead of taking a request that no one
 * will ever be pinged about.
 */
export async function getNearbyAvailability(
  params: NearbyAvailabilityQuery,
): Promise<NearbyAvailability> {
  const result = await query<{
    online: string;
    total: string;
    nearest_online_meters: string | null;
    median_trust: string | null;
  }>(
    `WITH origin AS (
       SELECT ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography AS g
     ),
     in_range AS (
       SELECT p.availability_status,
              p.trust_score,
              ST_Distance(p.location, o.g) AS distance_meters
         FROM providers p
         CROSS JOIN origin o
        WHERE p.location IS NOT NULL
          AND ST_DWithin(p.location, o.g, $3::float8)
          AND ($4::text IS NULL OR lower(p.category) = lower($4::text))
     )
     SELECT
       COUNT(*) FILTER (WHERE availability_status = 'online')             AS online,
       COUNT(*)                                                           AS total,
       MIN(distance_meters) FILTER (WHERE availability_status = 'online') AS nearest_online_meters,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trust_score)
         FILTER (WHERE availability_status = 'online')                    AS median_trust
       FROM in_range`,
    [params.lng, params.lat, params.radiusMeters, params.category],
  );

  const row = result.rows[0];
  return {
    category: params.category,
    radiusMeters: params.radiusMeters,
    online: Number(row?.online ?? 0),
    total: Number(row?.total ?? 0),
    nearestOnlineMeters:
      row?.nearest_online_meters == null
        ? null
        : Math.round(Number(row.nearest_online_meters)),
    medianTrustScore:
      row?.median_trust == null ? null : Math.round(Number(row.median_trust)),
  };
}
