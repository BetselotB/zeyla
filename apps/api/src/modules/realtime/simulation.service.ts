import { query } from "../../db/client.js";
import { env } from "../../config/env.js";
import { ApiError } from "../marketplace/lib/errors.js";
import { recordLocation } from "./location.service.js";
import { getContractParties } from "./membership.js";

/**
 * Demo fallback from the build plan: animate the provider along a straight line
 * to the job instead of relying on a phone actually walking around the room.
 * Emits on the same path as a real GPS tick, so the UI cannot tell the
 * difference. DEMO_MODE only.
 */
const running = new Map<string, NodeJS.Timeout>();

export interface SimulationOptions {
  steps: number;
  intervalMs: number;
}

export async function startRouteSimulation(
  contractId: string,
  userId: string,
  options: SimulationOptions,
) {
  if (!env.DEMO_MODE) throw ApiError.forbidden("demo_mode_disabled");
  if (running.has(contractId)) throw ApiError.conflict("simulation_already_running");

  const parties = await getContractParties(contractId);
  if (!parties) throw ApiError.notFound("contract");
  if (parties.userId !== userId && parties.providerId !== userId) {
    throw ApiError.notFound("contract");
  }

  const route = await query<{
    from_lat: number;
    from_lng: number;
    to_lat: number;
    to_lng: number;
  }>(
    `SELECT COALESCE(p.current_lat, p.base_lat) AS from_lat,
            COALESCE(p.current_lng, p.base_lng) AS from_lng,
            r.lat AS to_lat,
            r.lng AS to_lng
       FROM contracts c
       JOIN providers p ON p.user_id = c.provider_id
       JOIN service_requests r ON r.id = c.request_id
      WHERE c.id = $1::uuid`,
    [contractId],
  );

  const leg = route.rows[0];
  if (!leg || leg.from_lat === null || leg.to_lat === null) {
    throw ApiError.badRequest("route_unavailable");
  }

  let step = 0;
  const timer = setInterval(() => {
    step += 1;
    const t = Math.min(1, step / options.steps);
    const lat = Number(leg.from_lat) + (Number(leg.to_lat) - Number(leg.from_lat)) * t;
    const lng = Number(leg.from_lng) + (Number(leg.to_lng) - Number(leg.from_lng)) * t;

    void recordLocation(parties.providerId, {
      contractId,
      lat,
      lng,
      headingDegrees: bearing(leg.from_lat, leg.from_lng, leg.to_lat, leg.to_lng),
      speedMps: 8,
      accuracyMeters: 12,
    }).catch((err) => {
      console.error("[realtime] simulation tick failed", err);
      stopRouteSimulation(contractId);
    });

    if (t >= 1) stopRouteSimulation(contractId);
  }, options.intervalMs);

  running.set(contractId, timer);

  return {
    contractId,
    providerId: parties.providerId,
    from: { lat: Number(leg.from_lat), lng: Number(leg.from_lng) },
    to: { lat: Number(leg.to_lat), lng: Number(leg.to_lng) },
    steps: options.steps,
    intervalMs: options.intervalMs,
  };
}

export function stopRouteSimulation(contractId: string) {
  const timer = running.get(contractId);
  if (!timer) return false;
  clearInterval(timer);
  running.delete(contractId);
  return true;
}

export function isSimulating(contractId: string) {
  return running.has(contractId);
}

function bearing(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}
