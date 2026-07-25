import { Router } from "express";
import { pingDb } from "./db/client.js";
import { pingRedis } from "./lib/redis.js";
import { env } from "./config/env.js";
import { authRouter } from "./modules/auth/routes.js";
import { marketplaceRouter } from "./modules/marketplace/routes.js";
import { escrowRouter } from "./modules/escrow/routes.js";
import { notificationsRouter } from "./modules/notifications/routes.js";
import { trustRouter } from "./modules/trust/routes.js";

export function createAppRouter() {
  const router = Router();

  router.get("/health", async (_req, res) => {
    let db = false;
    let redis = false;
    try {
      db = await pingDb();
    } catch {
      db = false;
    }
    try {
      redis = await pingRedis();
    } catch {
      redis = false;
    }

    res.status(db ? 200 : 503).json({
      ok: db,
      service: "zeyla-api",
      demoMode: env.DEMO_MODE,
      checks: { db, redis },
    });
  });

  router.use("/auth", authRouter);
  router.use("/marketplace", marketplaceRouter);
  router.use("/escrow", escrowRouter);
  router.use("/notifications", notificationsRouter);
  router.use("/trust", trustRouter);

  return router;
}
