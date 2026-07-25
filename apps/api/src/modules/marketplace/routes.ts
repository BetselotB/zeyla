import { Router } from "express";
import { notImplemented, ok } from "../../lib/respond.js";

/**
 * Marketplace — discovery, service requests, pings.
 * Geo search via PostGIS ST_DWithin (Hrs 2–6).
 */
export const marketplaceRouter = Router();

marketplaceRouter.get("/providers", (_req, res) => {
  // TODO: SELECT … WHERE ST_DWithin(location, point, radius) ORDER BY trust_score DESC
  res.json(
    ok({
      providers: [],
      note: "Seed providers + PostGIS radius search in Hrs 2–6",
    }),
  );
});

marketplaceRouter.post("/requests", (_req, res) => {
  notImplemented(
    res,
    "Create service_requests row + optional Whisperflow/Addis AI parse",
  );
});

marketplaceRouter.post("/requests/:id/pings", (_req, res) => {
  notImplemented(
    res,
    "Fan out pings to nearby online providers (Redis + Socket.io)",
  );
});
