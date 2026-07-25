import { Router } from "express";
import { env } from "../../config/env.js";
import { notImplemented, ok } from "../../lib/respond.js";

/**
 * Auth module — use Supabase Auth (phone OTP) for identity.
 * Do not hand-roll JWT/session. KYC lives on top of managed auth.
 *
 * Wire during Hrs 0–2:
 * 1. Create Supabase project
 * 2. Enable phone auth
 * 3. Validate Bearer JWT from Supabase on protected routes
 */
export const authRouter = Router();

authRouter.get("/status", (_req, res) => {
  res.json(
    ok({
      provider: "supabase",
      configured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
      note: "Phone OTP via Supabase Auth — KYC (Fal ID/selfie) is separate",
    }),
  );
});

// TODO(hackathon Hrs 13–16): POST /kyc/verify — upload ID + selfie → Fal OCR + face match
authRouter.post("/kyc/verify", (_req, res) => {
  notImplemented(res, "Wire Fal ID-card OCR + selfie-vs-ID face match here");
});
