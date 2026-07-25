/**
 * Bearer token persistence for the logged-in session.
 *
 * NOTE: this is duplicated in apps/web/src/pages/onboarding/authToken.ts
 * (where the token is first set, after OTP verify) because there's no shared
 * auth/session module either page folder can import from without a
 * components/ or packages/shared PR. Worth proposing a real `src/lib/auth.ts`
 * once someone owns that decision — until then this is the pragmatic option
 * that keeps both folders independently editable.
 */
const STORAGE_KEY = "zeyla:authToken";

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function authHeaders(): HeadersInit | undefined {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}
