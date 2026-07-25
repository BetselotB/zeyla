/**
 * Bearer token persistence for the logged-in session.
 *
 * NOTE: this is duplicated in apps/web/src/pages/payment/authToken.ts because
 * there's no shared auth/session module either page folder can import from
 * without a components/ or packages/shared PR. Worth proposing a real
 * `src/lib/auth.ts` once someone owns that decision — until then this is the
 * pragmatic option that keeps both folders independently editable.
 */
const STORAGE_KEY = "zeyla:authToken";

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage unavailable (private browsing, etc.) — session just won't persist across reloads.
  }
}

export function clearAuthToken(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function authHeaders(): HeadersInit | undefined {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}
