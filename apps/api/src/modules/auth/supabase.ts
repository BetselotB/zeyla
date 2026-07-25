import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthProvider } from "@zeyla/shared";
import { env } from "../../config/env.js";

/**
 * Supabase is the real identity provider when it is configured. Everything
 * here degrades to "not configured" rather than throwing, so the API still
 * boots and the mock OTP path still works on a laptop with no keys.
 */

export function isSupabaseConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

export function usingSupabaseOtp(): boolean {
  return env.AUTH_OTP_PROVIDER === "supabase" && isSupabaseConfigured();
}

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return client;
}

export interface SupabaseIdentity {
  uid: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  /** Which Supabase provider signed this user in — "google", "email", "phone". */
  provider: AuthProvider | null;
}

/**
 * Google returns the display name and picture under whichever of these keys the
 * OIDC payload happened to use. Reading all of them means a Google account
 * arrives with an avatar instead of a blank profile.
 */
function readMetadata(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Supabase reports an unset phone or email as "" rather than omitting it.
 * Storing that would put an empty string in a UNIQUE column, so the second
 * email-only signup would collide with the first.
 */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toAuthProvider(value: unknown): AuthProvider | null {
  if (value === "google") return "google";
  if (value === "email") return "email";
  if (value === "phone") return "phone";
  return null;
}

/** Returns null for any token Supabase does not vouch for. */
export async function verifySupabaseToken(
  token: string,
): Promise<SupabaseIdentity | null> {
  const supabase = getClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;

    const metadata = data.user.user_metadata as
      | Record<string, unknown>
      | undefined;
    return {
      uid: data.user.id,
      phone: blankToNull(data.user.phone),
      email: blankToNull(data.user.email),
      name: readMetadata(metadata, ["full_name", "name", "user_name"]),
      avatarUrl: readMetadata(metadata, ["avatar_url", "picture"]),
      provider: toAuthProvider(data.user.app_metadata?.provider),
    };
  } catch {
    return null;
  }
}

export async function sendSupabaseOtp(phone: string): Promise<void> {
  const supabase = getClient();
  if (!supabase) throw new Error("supabase_not_configured");

  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw new Error(`supabase_otp_failed: ${error.message}`);
}

export async function verifySupabaseOtp(
  phone: string,
  code: string,
): Promise<{ token: string; uid: string; expiresAt: Date } | null> {
  const supabase = getClient();
  if (!supabase) throw new Error("supabase_not_configured");

  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token: code,
    type: "sms",
  });
  if (error || !data.session || !data.user) return null;

  return {
    token: data.session.access_token,
    uid: data.user.id,
    expiresAt: new Date(
      (data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
    ),
  };
}
