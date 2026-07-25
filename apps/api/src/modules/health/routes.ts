import { Router } from "express";
import { pingDb } from "../../db/client.js";
import { pingRedis } from "../../lib/redis.js";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/respond.js";

/** Infra health — shared, keep it dependency-free of feature modules. */
export const healthRouter = Router();

healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
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
      success: db,
      data: {
        service: "zeyla-api",
        demoMode: env.DEMO_MODE,
        checks: { db, redis },
      },
      error: db ? null : "database_unreachable",
    });
  }),
);
