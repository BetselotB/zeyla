import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
    return { uid: data.user.id, phone: data.user.phone ?? null };
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
