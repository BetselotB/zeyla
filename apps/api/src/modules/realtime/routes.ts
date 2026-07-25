import { Router } from "express";
import { notImplemented, ok } from "../../lib/respond.js";

/**
 * Realtime HTTP surface — diagnostics and REST fallbacks only.
 * The socket server itself lives in ./socket.ts.
 */
export const realtimeRouter = Router();

realtimeRouter.get("/status", (_req, res) => {
  res.json(
    ok({
      transport: "socket.io",
      events: [
        "join:contract",
        "provider:location",
        "contract:location",
        "ping:notify",
        "ping:incoming",
      ],
    }),
  );
});

realtimeRouter.get("/contracts/:id/location", (_req, res) => {
  notImplemented(
    res,
    "REST fallback: read cached geo:contract:{id} from Redis for clients without sockets",
  );
});
