import { Router } from "express";
import { parseServiceRequest } from "./ai/addisAi.js";
import { getProviderDetail, searchProviders } from "./discovery.service.js";
import { requireActor } from "./lib/actor.js";
import { handle } from "./lib/handle.js";
import {
  fanoutPings,
  listProviderPings,
  listRequestPings,
  respondToPing,
} from "./pings.service.js";
import {
  createServiceRequest,
  getOwnedServiceRequest,
  listServiceRequests,
} from "./requests.service.js";
import {
  createRequestSchema,
  fanoutSchema,
  pingResponseSchema,
  providerDetailQuerySchema,
  providerPingsQuerySchema,
  providerSearchSchema,
  uuidSchema,
  voiceParseSchema,
  voiceRequestSchema,
} from "./schemas.js";
import { createRequestFromVoice } from "./voice.service.js";

/**
 * Marketplace — discovery, service requests, pings.
 * Request/response shapes: see ./API.md (shared with the discovery UI).
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
  handle(async (req) => {
    const actor = requireActor(req);
    const requests = await listServiceRequests(actor);
    return { requests };
  }),
);

marketplaceRouter.get(
  "/requests/:id",
  handle(async (req) => {
    const actor = requireActor(req);
    const requestId = uuidSchema.parse(req.params.id);
    const request = await getOwnedServiceRequest(actor, requestId);
    const pings = await listRequestPings(requestId);
    return { request, pings };
  }),
);

// --- Pings -------------------------------------------------------------------

marketplaceRouter.post(
  "/requests/:id/pings",
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

// --- Voice requests ----------------------------------------------------------

/** Whisperflow transcript -> Addis AI parse -> a real service request. */
marketplaceRouter.post(
  "/voice-requests",
  handle(
    async (req) => {
      const actor = requireActor(req);
      const input = voiceRequestSchema.parse(req.body);
      return createRequestFromVoice(actor, input);
    },
    { status: 201 },
  ),
);

/** Parse only — lets the UI preview what was understood before committing. */
marketplaceRouter.post(
  "/voice/parse",
  handle(async (req) => {
    const { transcript } = voiceParseSchema.parse(req.body);
    const parse = await parseServiceRequest(transcript);
    return { transcript, parse };
  }),
);

/** Provider inbox. */
marketplaceRouter.get(
  "/pings",
  handle(async (req) => {
    const actor = requireActor(req);
    const filters = providerPingsQuerySchema.parse(req.query);
    const pings = await listProviderPings(actor, filters);
    return { pings };
  }),
);

marketplaceRouter.post(
  "/pings/:id/respond",
  handle(async (req) => {
    const actor = requireActor(req);
    const pingId = uuidSchema.parse(req.params.id);
    const { action } = pingResponseSchema.parse(req.body);
    return respondToPing(actor, pingId, action);
  }),
);
