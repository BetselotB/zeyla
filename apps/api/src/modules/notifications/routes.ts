import { Router } from "express";
import { z } from "zod";
import { notImplemented } from "../../lib/respond.js";
import { requireAuth } from "../auth/middleware.js";
import { requireActor } from "../marketplace/lib/actor.js";
import { handle } from "../marketplace/lib/handle.js";
import { uuidSchema } from "../marketplace/schemas.js";
import {
  listNotifications,
  markAllRead,
  markRead,
} from "./notifications.service.js";

/**
 * Notifications — in-app feed, delivered live over the socket `notification:new`
 * event and readable over REST for clients that were offline.
 *
 * Voice alerts are gone: ElevenLabs was cut from scope, so nothing here speaks.
 * Shapes: ./API.md.
 */
export const notificationsRouter = Router();

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .default(false)
    .transform((v) => v === true || v === "true" || v === "1"),
});

notificationsRouter.get(
  "/",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const options = feedQuerySchema.parse(req.query);
    return listNotifications(actor, options);
  }),
);

notificationsRouter.post(
  "/:id/read",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    const id = uuidSchema.parse(req.params.id);
    const notification = await markRead(actor, id);
    return { notification };
  }),
);

notificationsRouter.post(
  "/read-all",
  requireAuth,
  handle(async (req) => {
    const actor = requireActor(req);
    return markAllRead(actor);
  }),
);

/**
 * Browser push needs VAPID keys and a service worker on the web side, neither
 * of which exists yet. Stubbed rather than silently accepting tokens that would
 * never be delivered to.
 */
notificationsRouter.post("/devices", (_req, res) => {
  notImplemented(
    res,
    "Web push: needs VAPID keys + a service worker in apps/web. In-app feed and socket delivery work today.",
  );
});
