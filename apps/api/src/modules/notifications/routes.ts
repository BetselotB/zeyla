import { Router } from "express";

/**
 * Notifications — push + voice polish layer (ElevenLabs).
 * Add once the core loop works end-to-end (Hrs 19–22).
 */
export const notificationsRouter = Router();

notificationsRouter.post("/voice-alert", (_req, res) => {
  res.status(501).json({
    error: "not_implemented",
    hint: "ElevenLabs TTS for ping alerts / reading trust score aloud",
  });
});
