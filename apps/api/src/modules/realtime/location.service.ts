import type { CachedLocation, LiveLocation } from "@zeyla/shared";
import { REALTIME_EVENTS } from "@zeyla/shared";
import { query } from "../../db/client.js";
import { contractGeoKey, redis } from "../../lib/redis.js";
import { ApiError } from "../marketplace/lib/errors.js";
import { emitToContract } from "./io.js";
import { getContractParties, isContractMember, type ContractParties } from "./membership.js";

/** A fix older than this is treated as "no live location". */
export const LOCATION_TTL_SECONDS = 30;

/** providers.current_lat/lng is a convenience mirror — no need to write it at GPS rate. */
const DB_MIRROR_INTERVAL_SECONDS = 30;

/** Statuses during which a provider is expected to be moving toward the job. */
const TRACKABLE_STATUSES = new Set(["escrowed", "active"]);

export interface LocationInput {
  contractId: string;
  lat: number;
  lng: number;
  headingDegrees?: number | null;
  speedMps?: number | null;
  accuracyMeters?: number | null;
}

async function loadParties(contractId: string): Promise<ContractParties> {
  const parties = await getContractParties(contractId);
  if (!parties) throw ApiError.notFound("contract");
  return parties;
}

export async function assertContractAccess(
  contractId: string,
  userId: string,
): Promise<ContractParties> {
  const parties = await loadParties(contractId);
  if (!isContractMember(parties, userId)) throw ApiError.notFound("contract");
  return parties;
}

/**
 * Store one GPS sample and push it to the paired customer.
 *
 * Redis is the source of truth for "where is the provider right now" — the key
 * expires on its own, so a stale fix can never be served as live after the
 * provider's phone goes quiet.
 */
export async function recordLocation(
  userId: string,
  input: LocationInput,
): Promise<LiveLocation> {
  // Non-parties get the same 404 a missing contract would give, so posting a
  // location cannot be used to probe which contract ids exist. The customer is
  // a party, so they get a straight 403 instead.
  const parties = await assertContractAccess(input.contractId, userId);

  if (parties.providerId !== userId) {
    throw ApiError.forbidden("only_the_provider_can_post_location");
  }
  if (!TRACKABLE_STATUSES.has(parties.status)) {
    throw ApiError.conflict("contract_not_trackable", { status: parties.status });
  }

  const location: LiveLocation = {
    contractId: input.contractId,
    providerId: parties.providerId,
    lat: input.lat,
    lng: input.lng,
    headingDegrees: input.headingDegrees ?? null,
    speedMps: input.speedMps ?? null,
    accuracyMeters: input.accuracyMeters ?? null,
    recordedAt: new Date().toISOString(),
  };

  await redis.set(
    contractGeoKey(input.contractId),
    JSON.stringify(location),
    "EX",
    LOCATION_TTL_SECONDS,
  );

  emitToContract(input.contractId, REALTIME_EVENTS.CONTRACT_LOCATION, location);
  await mirrorToDatabase(parties.providerId, input.lat, input.lng);

  return location;
}

/** Best-effort: a failed mirror write must not drop the customer's live pin. */
async function mirrorToDatabase(providerId: string, lat: number, lng: number) {
  try {
    const throttleKey = `geo:mirror:${providerId}`;
    const fresh = await redis.set(throttleKey, "1", "EX", DB_MIRROR_INTERVAL_SECONDS, "NX");
    if (fresh !== "OK") return;

    await query(
      `UPDATE providers
          SET current_lat = $2::float8, current_lng = $3::float8, last_seen_at = now()
        WHERE user_id = $1::uuid`,
      [providerId, lat, lng],
    );
  } catch (err) {
    console.error("[realtime] provider location mirror failed", err);
  }
}

export async function getCachedLocation(
  contractId: string,
): Promise<CachedLocation | null> {
  const raw = await redis.get(contractGeoKey(contractId));
  if (!raw) return null;

  const location = JSON.parse(raw) as LiveLocation;
  const ageSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(location.recordedAt).getTime()) / 1000),
  );
  return { ...location, ageSeconds };
}
