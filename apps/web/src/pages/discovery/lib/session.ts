import type { ApiResponse, AuthStatusResponse, VerifyOtpResponse } from "@zeyla/shared";

/**
 * Bearer token for the discovery pages.
 *
 * Every write endpoint sits behind `requireAuth`, so discovery needs a token
 * even though it is the app's entry point and has no login screen of its own.
 * A token stored by the onboarding flow is always preferred; `ensureSession`
 * only self-provisions one when the API says it is running the mock OTP
 * provider, which is a dev/demo-only mode. Against a real SMS provider that
 * branch is unreachable and the caller gets `login_required` instead.
 */
const TOKEN_KEY = "zeyla_token";

/** Shared with onboarding so both flows read and write the same token. */
export function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
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
