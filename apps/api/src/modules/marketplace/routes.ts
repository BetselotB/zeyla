import { Router } from "express";
import { notImplemented } from "../../lib/respond.js";
import { getProviderDetail, searchProviders } from "./discovery.service.js";
import { handle } from "./lib/handle.js";
import {
  providerDetailQuerySchema,
  providerSearchSchema,
  uuidSchema,
} from "./schemas.js";

/**
 * Marketplace — discovery, service requests, pings.
 * Request/response shapes: see ./API.md (shared with the discovery UI).
 */
export const marketplaceRouter = Router();

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

marketplaceRouter.post("/requests", (_req, res) => {
  notImplemented(res, "Create service_requests row + optional Whisperflow/Addis AI parse");
});

marketplaceRouter.post("/requests/:id/pings", (_req, res) => {
  notImplemented(res, "Fan out pings to nearby online providers (Redis + Socket.io)");
});
