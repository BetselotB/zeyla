import { Router } from "express";
import { healthRouter } from "./modules/health/routes.js";
import { authRouter } from "./modules/auth/routes.js";
import { escrowRouter } from "./modules/escrow/routes.js";
import { marketplaceRouter } from "./modules/marketplace/routes.js";
import { realtimeRouter } from "./modules/realtime/routes.js";
import { notificationsRouter } from "./modules/notifications/routes.js";
import { trustRouter } from "./modules/trust/routes.js";

/**
 * Route registry only. No business logic, no handlers, no middleware bodies.
 * Every module owns exactly one line here — see .cursorrules.
 */
export function createAppRouter() {
  const router = Router();

  router.use("/health", healthRouter);
  router.use("/auth", authRouter);
  router.use("/escrow", escrowRouter);
  router.use("/marketplace", marketplaceRouter);
  router.use("/realtime", realtimeRouter);
  router.use("/notifications", notificationsRouter);
  router.use("/trust", trustRouter);

  return router;
}
