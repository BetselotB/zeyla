import { Router } from "express";
import { notImplemented } from "../../lib/respond.js";

/**
 * Notifications — push + voice polish layer (ElevenLabs).
 * Add once the core loop works end-to-end (Hrs 19–22).
 */
export const notificationsRouter = Router();

notificationsRouter.post("/voice-alert", (_req, res) => {
  notImplemented(
    res,
    "ElevenLabs TTS for ping alerts / reading trust score aloud",
  );
});
