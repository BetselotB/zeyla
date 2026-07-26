import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import {
  getAvailability,
  getNearbyAvailability,
  heartbeat,
  setAvailability,
} from "./availability.service.js";
import { getProviderDetail, searchProviders } from "./discovery.service.js";
import { requireActor } from "./lib/actor.js";
import { handle } from "./lib/handle.js";
import { matchProviders, pairRequestWithProvider } from "./matching.service.js";
import {
  getOwnProviderProfile,
  upsertProviderProfile,
} from "./profile.service.js";
import { getProviderDashboard } from "./provider-home.service.js";
import {
  cancelJobForActor,
  fanoutPings,
  listProviderPings,
  listRequestPings,
  respondToPing,
} from "./pings.service.js";
import {
  createServiceRequest,
  getActiveJob,
  getOwnedServiceRequest,
  listServiceRequests,
} from "./requests.service.js";
import {
  createRequestSchema,
  fanoutSchema,
  heartbeatSchema,
  matchQuerySchema,
  nearbyAvailabilitySchema,
  pairSchema,
  pingResponseSchema,
  providerDetailQuerySchema,
  providerPingsQuerySchema,
  providerProfileSchema,
  providerSearchSchema,
  setAvailabilitySchema,
  transcribeSchema,
  uuidSchema,
  voiceParseSchema,
  voiceRequestSchema,
} from "./schemas.js";
import {
  createRequestFromVoice,
  interpretTranscript,
  resolveTranscript,
} from "./voice.service.js";

/**
 * Marketplace — discovery, service requests, pings.
 * Request/response shapes: see ./API.md (shared with the discovery UI).
 *
 * Browsing providers is open; anything that writes, or that reads one caller's
 * own rows, sits behind `requireAuth` and reads its identity from the verified
 * token rather than from anything the client sends in the body.
 */
export const marketplaceRouter = Router();

// --- Discovery ---------------------------------------------------------------

marketplaceRouter.get(
  "/providers",
  handle(async (req) => {
    const params = providerSearchSchema.parse(req.query);
    return searchProviders(params);
  }),
);

/**
 * Create or update the caller's own provider profile — the last step of
 * onboarding. Registered before `/providers/:id` so "me" is not parsed as a id.
 */
marketplaceRouter.post(
  "/providers",
  requireAuth,
  handle(
    async (req) => {
      const actor = requireActor(req);
      const input = providerProfileSchema.parse(req.body);
      return upsertProviderProfile(actor, input);
    },
    { status: 201 },
  ),
);

marketplaceRouter.get(
  "/providers/me",
  requireAuth,
  handle(async (req) => {
    const provider = await getOwnProviderProfile(requireActor(req));
    return { provider };
  }),
);

// --- Availability ------------------------------------------------------------
// The provider's own "go online" switch. Registered before `/providers/:id` so
// "me" is never parsed as an id.

marketplaceRouter.get(
  "/providers/me/availability",
  requireAuth,
  handle(async (req) => {
    const availability = await getAvailability(requireActor(req).userId);
    return { availability };
  }),
);

/**
 * Turn discoverability on or off. Idempotent, so a client retrying a toggle it
 * is unsure landed cannot open a second shift.
 */
marketplaceRouter.put(
  "/providers/me/availability",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const input = setAvailabilitySchema.parse(req.body ?? {});
    const availability = await setAvailability(actor.userId, input);
    return { availability };
  }),
);

/** Proof the app is still open. Cannot change status — only the provider can. */
marketplaceRouter.post(
  "/providers/me/heartbeat",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const input = heartbeatSchema.parse(req.body ?? {});
    const availability = await heartbeat(actor.userId, input);
    return { availability };
  }),
);

/** Everything the provider home screen renders. */
marketplaceRouter.get(
  "/providers/me/dashboard",
  requireAuth,
  handle(async (req) => getProviderDashboard(requireActor(req))),
);

/**
 * Customer-facing mirror of the same switch: how many providers near a point
 * are online right now, so the intake screen can say so before a request is
 * collected that nobody would be pinged about. Open — this is what the landing
 * page shows before anyone signs in.
 */
marketplaceRouter.get(
  "/availability/nearby",
  handle(async (req) => {
    const params = nearbyAvailabilitySchema.parse(req.query);
    return getNearbyAvailability(params);
  }),
);

marketplaceRouter.get(
  "/providers/:id",
  handle(async (req) => {
    const providerId = uuidSchema.parse(req.params.id);
    const { lat, lng } = providerDetailQuerySchema.parse(req.query);
    const origin = lat !== undefined && lng !== undefined ? { lat, lng } : null;
    return getProviderDetail(providerId, origin);
  }),
);

// --- Service requests --------------------------------------------------------

marketplaceRouter.post(
  "/requests",
  requireAuth,
  handle(
    async (req) => {
      const actor = requireActor(req);
      const input = createRequestSchema.parse(req.body);
      const request = await createServiceRequest(actor, input);
      return { request };
    },
    { status: 201 },
  ),
);

marketplaceRouter.get(
  "/requests",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const requests = await listServiceRequests(actor);
    return { requests };
  }),
);

/**
 * The caller's one unfinished job, or null. Registered before `/requests/:id`
 * so "active" is never parsed as an id.
 */
marketplaceRouter.get(
  "/requests/active",
  requireAuth,
  handle(async (req) => {
    const active = await getActiveJob(requireActor(req));
    return { active };
  }),
);

marketplaceRouter.get(
  "/requests/:id",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const requestId = uuidSchema.parse(req.params.id);
    const request = await getOwnedServiceRequest(actor, requestId);
    const pings = await listRequestPings(requestId);
    return { request, pings };
  }),
);

/** Either party walks away. The service decides which one is calling. */
marketplaceRouter.post(
  "/requests/:id/cancel",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const requestId = uuidSchema.parse(req.params.id);
    return cancelJobForActor(actor, requestId);
  }),
);

// --- Pings -------------------------------------------------------------------

marketplaceRouter.post(
  "/requests/:id/pings",
  requireAuth,
  handle(
    async (req) => {
      const actor = requireActor(req);
      const requestId = uuidSchema.parse(req.params.id);
      const options = fanoutSchema.parse(req.body ?? {});
      return fanoutPings(actor, requestId, options);
    },
    { status: 201 },
  ),
);

// --- Matching ----------------------------------------------------------------

/**
 * Who should take this job, best first, with a reason for each. Read-only —
 * nobody is contacted until the customer commits below.
 */
marketplaceRouter.get(
  "/requests/:id/matches",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const requestId = uuidSchema.parse(req.params.id);
    const options = matchQuerySchema.parse(req.query);
    return matchProviders(actor, requestId, options);
  }),
);

/** Commit to a pairing: ping the named provider, or the best-ranked ones. */
marketplaceRouter.post(
  "/requests/:id/match",
  requireAuth,
  handle(
    async (req) => {
      const actor = requireActor(req);
      const requestId = uuidSchema.parse(req.params.id);
      const { provider_id: snakeId, providerId, ...rest } = pairSchema.parse(req.body ?? {});
      return pairRequestWithProvider(actor, requestId, {
        ...rest,
        providerId: providerId ?? snakeId,
      });
    },
    { status: 201 },
  ),
);

// --- Voice requests ----------------------------------------------------------

/** Addis AI transcript -> Gemini parse -> a real service request. */
marketplaceRouter.post(
  "/voice-requests",
  requireAuth,
  handle(
    async (req) => {
      const actor = requireActor(req);
      const input = voiceRequestSchema.parse(req.body);
      return createRequestFromVoice(actor, input);
    },
    { status: 201 },
  ),
);

/**
 * Audio -> text only. The intake screen puts the transcript in the textarea so
 * the customer can correct a mishearing before anything is created.
 */
marketplaceRouter.post(
  "/transcribe",
  requireAuth,
  handle(async (req) => {
    const input = transcribeSchema.parse(req.body);
    const transcription = await resolveTranscript(input);
    return { transcription, transcript: transcription.transcript };
  }),
);

/**
 * Text -> structured request, without creating one. Lets the UI show what was
 * understood, translated, before committing. Behind auth because it spends
 * model quota on whatever text it is handed.
 */
marketplaceRouter.post(
  "/classify",
  requireAuth,
  handle(async (req) => {
    const { transcript, language } = voiceParseSchema.parse(req.body);
    const parse = await interpretTranscript(transcript, language);
    return { transcript, parse, classification: parse };
  }),
);

/** Kept as an alias of /classify — the smoke tests and API.md name this path. */
marketplaceRouter.post(
  "/voice/parse",
  requireAuth,
  handle(async (req) => {
    const { transcript, language } = voiceParseSchema.parse(req.body);
    const parse = await interpretTranscript(transcript, language);
    return { transcript, parse };
  }),
);

/** Provider inbox. */
marketplaceRouter.get(
  "/pings",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const filters = providerPingsQuerySchema.parse(req.query);
    const pings = await listProviderPings(actor, filters);
    return { pings };
  }),
);

marketplaceRouter.post(
  "/pings/:id/respond",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const pingId = uuidSchema.parse(req.params.id);
    const { action } = pingResponseSchema.parse(req.body);
    return respondToPing(actor, pingId, action);
  }),
);
