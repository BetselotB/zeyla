import { Router } from "express";
import { z } from "zod";
import { REALTIME_EVENTS } from "@zeyla/shared";
import { env } from "../../config/env.js";
import { requireAuth } from "../auth/middleware.js";
import { requireActor } from "../marketplace/lib/actor.js";
import { ApiError } from "../marketplace/lib/errors.js";
import { handle } from "../marketplace/lib/handle.js";
import { latSchema, lngSchema, uuidSchema } from "../marketplace/schemas.js";
import { contractRoom, roomSize } from "./io.js";
import {
  assertContractAccess,
  getCachedLocation,
  recordLocation,
  LOCATION_TTL_SECONDS,
} from "./location.service.js";
import {
  isSimulating,
  startRouteSimulation,
  stopRouteSimulation,
} from "./simulation.service.js";

/**
 * Realtime HTTP surface — REST mirrors of the socket flow, for clients that
 * cannot hold a socket open and for the demo GPS animation.
 * The socket server itself lives in ./socket.ts. Shapes: ./API.md.
 */
export const realtimeRouter = Router();

const locationBodySchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  headingDegrees: z.coerce.number().min(0).max(360).nullish(),
  speedMps: z.coerce.number().min(0).max(120).nullish(),
  accuracyMeters: z.coerce.number().min(0).max(10_000).nullish(),
});

const simulateBodySchema = z.object({
  steps: z.coerce.number().int().min(2).max(200).default(20),
  intervalMs: z.coerce.number().int().min(250).max(10_000).default(2_000),
});

realtimeRouter.get("/status", (_req, res) => {
  res.json({
    success: true,
    data: {
      transport: "socket.io",
      handshake: { auth: { token: "<Bearer token from /api/auth/otp/verify>" } },
      locationTtlSeconds: LOCATION_TTL_SECONDS,
      demoMode: env.DEMO_MODE,
      contractEventsChannel: "zeyla:contract-events",
      events: {
        clientToServer: [
          REALTIME_EVENTS.JOIN_CONTRACT,
          REALTIME_EVENTS.LEAVE_CONTRACT,
          REALTIME_EVENTS.PROVIDER_LOCATION,
          REALTIME_EVENTS.PROVIDER_PRESENCE,
        ],
        serverToClient: [
          REALTIME_EVENTS.PING_INCOMING,
          REALTIME_EVENTS.PING_ANSWERED,
          REALTIME_EVENTS.CONTRACT_LOCATION,
          REALTIME_EVENTS.CONTRACT_STATUS,
          REALTIME_EVENTS.PRESENCE_CHANGED,
          REALTIME_EVENTS.NOTIFICATION_NEW,
          REALTIME_EVENTS.REALTIME_ERROR,
        ],
      },
    },
    error: null,
  });
});

/** REST twin of the `provider:location` socket event. */
realtimeRouter.post(
  "/contracts/:id/location",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const contractId = uuidSchema.parse(req.params.id);
    const body = locationBodySchema.parse(req.body);
    const location = await recordLocation(actor.userId, { contractId, ...body });
    return { location };
  }),
);

realtimeRouter.get(
  "/contracts/:id/location",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const contractId = uuidSchema.parse(req.params.id);
    await assertContractAccess(contractId, actor.userId);

    const location = await getCachedLocation(contractId);
    if (!location) throw ApiError.notFound("location");

    return {
      location,
      watchers: await roomSize(contractRoom(contractId)),
      simulated: isSimulating(contractId),
    };
  }),
);

/** Demo only: animate the provider toward the job over the same socket path. */
realtimeRouter.post(
  "/contracts/:id/simulate",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const contractId = uuidSchema.parse(req.params.id);
    const options = simulateBodySchema.parse(req.body ?? {});
    return startRouteSimulation(contractId, actor.userId, options);
  }),
);

realtimeRouter.delete(
  "/contracts/:id/simulate",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const contractId = uuidSchema.parse(req.params.id);
    await assertContractAccess(contractId, actor.userId);
    return { stopped: stopRouteSimulation(contractId) };
  }),
);
