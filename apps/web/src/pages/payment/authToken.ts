/**
 * Thin wrapper over the app-wide session module in src/auth.
 *
 * Payment reads whichever session is live — a Supabase token from email/Google
 * sign-in, or the opaque token from this API's phone OTP flow — without caring
 * which one it got.
 */
export {
  authHeadersSync as authHeaders,
  clearStoredToken as clearAuthToken,
  getAccessTokenSync as getAuthToken,
  storeToken as setAuthToken,
} from "../../auth/session";
