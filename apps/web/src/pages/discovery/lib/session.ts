import type { ApiResponse, AuthStatusResponse, VerifyOtpResponse } from "@zeyla/shared";
import {
  clearStoredToken,
  getAccessTokenSync,
  storeToken as persistToken,
} from "../../../auth/session";

/**
 * Bearer token for the discovery pages.
 *
 * Every write endpoint sits behind `requireAuth`. Discovery no longer has to
 * provision its own session — the onboarding gate guarantees a signed-in user
 * before these pages ever render — but `ensureSession` stays as a dev
 * convenience for opening /discovery directly with the mock OTP provider on.
 * Against a real provider that branch is unreachable and the caller gets
 * `login_required` instead.
 *
 * Storage itself lives in src/auth/session.ts, shared with onboarding and
 * payment, so a Supabase email/Google session is visible here too.
 */
export function readToken(): string | null {
  return getAccessTokenSync();
}

export function storeToken(token: string) {
  persistToken(token);
}

export function clearToken() {
  clearStoredToken();
}

export const API_BASE = `${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/api`;

async function readEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body?.success || body.data == null) {
    throw new Error(body?.error ?? `request_failed_${res.status}`);
  }
  return body.data;
}

let pending: Promise<string> | null = null;

/**
 * A usable token, or a thrown error explaining why there is none.
 *
 * Concurrent callers share one in-flight bootstrap: the intake screen fires
 * transcribe and classify close together, and two parallel OTP flows would
 * create two demo users.
 */
export async function ensureSession(): Promise<string> {
  const existing = readToken();
  if (existing) return existing;

  pending ??= bootstrapDemoSession().finally(() => {
    pending = null;
  });
  return pending;
}

const DEMO_PHONE = "0911000000";

async function bootstrapDemoSession(): Promise<string> {
  const status = await readEnvelope<AuthStatusResponse>(
    await fetch(`${API_BASE}/auth/status`),
  );

  // Real SMS provider: we cannot read the code, so there is nothing to do but
  // send the user to the login screen.
  if (!status.otpCodesReturnedInResponse) {
    throw new Error("login_required");
  }

  const requested = await readEnvelope<{ devCode?: string }>(
    await fetch(`${API_BASE}/auth/otp/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: DEMO_PHONE }),
    }),
  );
  if (!requested.devCode) throw new Error("login_required");

  const verified = await readEnvelope<VerifyOtpResponse>(
    await fetch(`${API_BASE}/auth/otp/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: DEMO_PHONE, code: requested.devCode }),
    }),
  );

  storeToken(verified.token);
  return verified.token;
}
