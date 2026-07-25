/**
 * Thin wrapper over the app-wide session module in src/auth.
 *
 * This file used to own its own localStorage key, which meant a user signed in
 * on onboarding looked signed out on discovery and vice versa. All three ways
 * in (Supabase email/password, Supabase Google, phone OTP) now resolve through
 * one place; these exports stay so existing call sites keep working.
 */
export {
  authHeadersSync as authHeaders,
  clearStoredToken as clearAuthToken,
  getAccessTokenSync as getAuthToken,
  storeToken as setAuthToken,
} from "../../auth/session";
