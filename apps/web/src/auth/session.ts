import { supabase } from "./supabaseClient";

/**
 * The one place the app decides which bearer token to send.
 *
 * Two kinds of session can be live, and they are not interchangeable:
 *  - a Supabase session (email/password or Google), whose access token
 *    Supabase itself refreshes — never persist a copy of it, always ask;
 *  - an opaque token issued by our own API's phone OTP flow, which has no
 *    refresh and therefore does live in localStorage.
 *
 * Supabase wins when both exist, because it is the only one that can be
 * silently renewed.
 */
const TOKEN_KEY = "zeyla:authToken";

/**
 * Onboarding and discovery used to disagree on this key, so a user who signed
 * in on one screen looked signed out on the other. Reads still accept the old
 * key; writes only ever produce the current one.
 */
const LEGACY_TOKEN_KEYS = ["zeyla_token"];

/**
 * Last access token Supabase handed us. Kept in sync by AuthProvider, which
 * hears about every sign-in and silent refresh, so that call sites which cannot
 * await (React render paths, the older per-page `authToken` helpers) still send
 * a current token instead of missing the Supabase session entirely.
 */
let cachedSupabaseToken: string | null = null;

export function cacheSupabaseToken(token: string | null): void {
  cachedSupabaseToken = token;
}

export function readStoredToken(): string | null {
  try {
    const current = window.localStorage.getItem(TOKEN_KEY);
    if (current) return current;

    for (const key of LEGACY_TOKEN_KEYS) {
      const legacy = window.localStorage.getItem(key);
      if (legacy) {
        window.localStorage.setItem(TOKEN_KEY, legacy);
        window.localStorage.removeItem(key);
        return legacy;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private browsing with storage blocked: the session simply won't survive
    // a reload. Everything in this tab still works.
  }
}

export function clearStoredToken(): void {
  cachedSupabaseToken = null;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    for (const key of LEGACY_TOKEN_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

/** The bearer to send right now, or null when nobody is signed in. */
export async function getAccessToken(): Promise<string | null> {
  if (supabase) {
    // Asking the client (rather than the cache) lets it renew an access token
    // that expired while the tab was in the background.
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      cacheSupabaseToken(data.session.access_token);
      return data.session.access_token;
    }
  }
  return readStoredToken();
}

/** Best-effort token for callers that cannot await. Prefer `getAccessToken`. */
export function getAccessTokenSync(): string | null {
  return cachedSupabaseToken ?? readStoredToken();
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function authHeadersSync(): Record<string, string> {
  const token = getAccessTokenSync();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api`;
