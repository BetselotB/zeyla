import type {
  AuthStatusResponse,
  KycStatusResponse,
  RequestOtpResponse,
  VerifyOtpResponse,
} from "@zeyla/shared";
import { env } from "../../config/env.js";
import { storeKycUpload } from "./kyc.js";
import { issueOtp, verifyOtp } from "./otp.js";
import {
  saveKycUpload,
  toAuthUser,
  upsertUserByPhone,
  type UserRow,
} from "./repo.js";
import { issueSession } from "./sessions.js";
import {
  isSupabaseConfigured,
  sendSupabaseOtp,
  usingSupabaseOtp,
  verifySupabaseOtp,
} from "./supabase.js";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function authStatus(): AuthStatusResponse {
  const supabase = usingSupabaseOtp();
  return {
    provider: supabase ? "supabase" : "mock",
    supabaseConfigured: isSupabaseConfigured(),
    demoMode: env.DEMO_MODE,
    otpCodesReturnedInResponse: !supabase,
  };
}

export async function requestOtp(phone: string): Promise<RequestOtpResponse> {
  if (usingSupabaseOtp()) {
    await sendSupabaseOtp(phone);
    return { phone, expiresInSeconds: env.AUTH_OTP_TTL_SECONDS };
  }

  const { code, expiresInSeconds } = await issueOtp(phone);

  // Mock provider: there is no SMS, so the code has to reach the caller
  // somehow. Both of these are gated on the mock branch and never run when
  // a real SMS provider is configured.
  console.log(`[auth] mock OTP for ${phone}: ${code}`);
  return { phone, expiresInSeconds, devCode: code };
}

export async function verifyOtpAndLogin(
  phone: string,
  code: string,
): Promise<VerifyOtpResponse> {
  if (usingSupabaseOtp()) {
    const session = await verifySupabaseOtp(phone, code);
    if (!session) throw new AuthError("invalid_code", 401);

    const { user, created } = await upsertUserByPhone(phone, session.uid);
    return {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      isNewUser: created,
      user: toAuthUser(user),
    };
  }

  const result = await verifyOtp(phone, code);
  if (!result.ok) {
    const status = result.reason === "too_many_attempts" ? 429 : 401;
    throw new AuthError(result.reason, status);
  }

  const { user, created } = await upsertUserByPhone(phone, null);
  const session = await issueSession(user.id);

  return {
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    isNewUser: created,
    user: toAuthUser(user),
  };
}

/**
 * HACKATHON SHORTCUT: with KYC_AUTO_VERIFY on, submitting an ID photo and a
 * selfie flips the user straight to `verified`. No face match runs. The
 * `autoVerified` flag below exists so the UI can word the state honestly.
 */
export async function submitKyc(
  user: UserRow,
  body: Record<string, unknown>,
): Promise<KycStatusResponse> {
  const stored = await storeKycUpload(user.id, {
    idDocBase64: body.idDocBase64,
    selfieBase64: body.selfieBase64,
    idDocMimeType:
      typeof body.idDocMimeType === "string" ? body.idDocMimeType : undefined,
    selfieMimeType:
      typeof body.selfieMimeType === "string" ? body.selfieMimeType : undefined,
  });

  const status = env.KYC_AUTO_VERIFY ? "verified" : "manual_review";
  const note = env.KYC_AUTO_VERIFY
    ? "Auto-verified for demo — documents stored, no biometric match performed."
    : "Documents received, awaiting review.";

  const updated = await saveKycUpload(user.id, { ...stored, status, note });
  if (!updated) throw new AuthError("user_not_found", 404);

  return kycStatus(updated);
}

export function kycStatus(user: UserRow): KycStatusResponse {
  return {
    kycStatus: user.kyc_status,
    idDocUrl: user.id_doc_url,
    selfieUrl: user.selfie_url,
    submittedAt: user.kyc_submitted_at?.toISOString() ?? null,
    reviewedAt: user.kyc_reviewed_at?.toISOString() ?? null,
    note: user.kyc_note,
    autoVerified: env.KYC_AUTO_VERIFY && user.kyc_status === "verified",
  };
}
