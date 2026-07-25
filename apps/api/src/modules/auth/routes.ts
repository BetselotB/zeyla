import { Router, type Response } from "express";
import type { UserRole } from "@zeyla/shared";
import { pathParam } from "../../lib/params.js";
import { asyncHandler, fail, ok } from "../../lib/respond.js";
import { KycUploadError, resolveKycFile } from "./kyc.js";
import { authedUser, requireAdmin, requireAuth } from "./middleware.js";
import { InvalidPhoneError, normalisePhone } from "./phone.js";
import { setKycDecision, toAuthUser, updateProfile } from "./repo.js";
import { revokeSession } from "./sessions.js";
import {
  AuthError,
  authStatus,
  kycStatus,
  requestOtp,
  submitKyc,
  verifyOtpAndLogin,
} from "./service.js";

/**
 * Identity — phone OTP login and the simplified KYC upload.
 * Owner: @betselot. Response shapes live in @zeyla/shared/identity-money.ts;
 * change them there first so the frontend typecheck catches it.
 */
export const authRouter = Router();

const ROLES: UserRole[] = ["user", "provider"];

/**
 * Deliberately loose. Chapa does the strict check (it rejects domains with no
 * MX record), so this only rejects obvious nonsense before we get that far.
 * The 50-character ceiling is Chapa's limit on the field.
 */
function isPlausibleEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 50 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
  );
}

/** Maps this module's errors onto the shared envelope; rethrows anything else. */
function sendError(res: Response, err: unknown): void {
  if (err instanceof InvalidPhoneError) {
    res.status(400).json(fail("invalid_phone"));
    return;
  }
  if (err instanceof KycUploadError || err instanceof AuthError) {
    res.status(err.status).json(fail(err.message));
    return;
  }
  throw err;
}

authRouter.get("/status", (_req, res) => {
  res.json(ok(authStatus()));
});

authRouter.post(
  "/otp/request",
  asyncHandler(async (req, res) => {
    try {
      const phone = normalisePhone(req.body?.phone);
      res.json(ok(await requestOtp(phone)));
    } catch (err) {
      sendError(res, err);
    }
  }),
);

authRouter.post(
  "/otp/verify",
  asyncHandler(async (req, res) => {
    try {
      const phone = normalisePhone(req.body?.phone);
      const code = String(req.body?.code ?? "").trim();
      if (!code) {
        res.status(400).json(fail("code_required"));
        return;
      }
      res.json(ok(await verifyOtpAndLogin(phone, code)));
    } catch (err) {
      sendError(res, err);
    }
  }),
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const token = req.header("authorization")?.split(" ")[1];
    if (token) await revokeSession(token);
    res.json(ok({ loggedOut: true }));
  }),
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(ok(toAuthUser(authedUser(req))));
});

authRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = req.body?.name;
    const email = req.body?.email;
    const role = req.body?.role;

    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
      res.status(400).json(fail("invalid_name"));
      return;
    }
    if (email !== undefined && !isPlausibleEmail(email)) {
      res.status(400).json(fail("invalid_email"));
      return;
    }
    if (role !== undefined && !ROLES.includes(role)) {
      res.status(400).json(fail("invalid_role"));
      return;
    }

    const updated = await updateProfile(authedUser(req).id, {
      name: typeof name === "string" ? name.trim() : undefined,
      email: typeof email === "string" ? email.trim().toLowerCase() : undefined,
      role: role as UserRole | undefined,
    });
    if (!updated) {
      res.status(404).json(fail("user_not_found"));
      return;
    }
    res.json(ok(toAuthUser(updated)));
  }),
);

// --- KYC ---------------------------------------------------------------------
// HACKATHON SHORTCUT: upload only. No OCR, no selfie-vs-ID face match.
// See kyc.ts for what a real implementation would have to add.

authRouter.post(
  "/kyc/upload",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      res.json(ok(await submitKyc(authedUser(req), req.body ?? {})));
    } catch (err) {
      sendError(res, err);
    }
  }),
);

authRouter.get("/kyc/status", requireAuth, (req, res) => {
  res.json(ok(kycStatus(authedUser(req))));
});

/** Own files only — a user cannot read anyone else's ID photo. */
authRouter.get(
  "/kyc/file/:userId/:filename",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = pathParam(req, "userId");
    const filename = pathParam(req, "filename");
    if (authedUser(req).id !== userId) {
      res.status(403).json(fail("forbidden"));
      return;
    }

    const filePath = await resolveKycFile(userId, filename);
    if (!filePath) {
      res.status(404).json(fail("file_not_found"));
      return;
    }
    res.sendFile(filePath);
  }),
);

/** Manual KYC decision — stands in for the review queue we are not building. */
authRouter.post(
  "/admin/kyc/:userId/decision",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = req.body?.status;
    if (!["verified", "rejected", "manual_review"].includes(status)) {
      res.status(400).json(fail("invalid_status"));
      return;
    }

    const note = typeof req.body?.note === "string" ? req.body.note : null;
    const updated = await setKycDecision(pathParam(req, "userId"), status, note);
    if (!updated) {
      res.status(404).json(fail("user_not_found"));
      return;
    }
    res.json(ok(kycStatus(updated)));
  }),
);
