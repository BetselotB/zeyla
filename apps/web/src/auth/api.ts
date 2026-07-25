import type {
  ApiResponse,
  AuthStatusResponse,
  AuthUser,
  CompleteOnboardingResponse,
  SyncSessionResponse,
} from "@zeyla/shared";
import { API_BASE, authHeaders } from "./session";

async function unwrap<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body?.success || body.data == null) {
    throw new Error(body?.error ?? `request_failed_${response.status}`);
  }
  return body.data;
}

export function getAuthStatus(): Promise<AuthStatusResponse> {
  return fetch(`${API_BASE}/auth/status`).then(unwrap<AuthStatusResponse>);
}

/**
 * Exchanges the Supabase session for the Zeyla account, creating it on a first
 * sign-in. Idempotent, so the provider calls it on every session change rather
 * than trying to track whether the account already exists.
 */
export async function syncSession(): Promise<SyncSessionResponse> {
  const response = await fetch(`${API_BASE}/auth/session`, {
    method: "POST",
    headers: await authHeaders(),
  });
  return unwrap<SyncSessionResponse>(response);
}

export async function getMe(): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: await authHeaders(),
  });
  return unwrap<AuthUser>(response);
}

export async function completeOnboarding(): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/onboarding/complete`, {
    method: "POST",
    headers: await authHeaders(),
  });
  const { user } = await unwrap<CompleteOnboardingResponse>(response);
  return user;
}

export async function logout(): Promise<void> {
  // Best effort: the local session is cleared either way, and an expired token
  // failing to revoke itself is not something the user can act on.
  await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    headers: await authHeaders(),
  }).catch(() => undefined);
}
