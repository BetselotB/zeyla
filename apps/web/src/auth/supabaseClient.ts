import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is the identity provider for email/password and Google.
 *
 * The browser talks to Supabase directly and sends the resulting access token
 * to our API as a bearer, which verifies it and maps it to a Zeyla account. No
 * password or OAuth secret ever passes through our own backend.
 *
 * Missing keys are not an error: the app still boots and falls back to the
 * phone OTP flow, which this API serves on its own.
 */
const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // The Google redirect comes back with the session in the URL hash.
          detectSessionInUrl: true,
        },
      })
    : null;

export function isSupabaseAuthEnabled(): boolean {
  return supabase !== null;
}
