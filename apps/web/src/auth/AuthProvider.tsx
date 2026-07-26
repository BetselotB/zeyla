import type { AuthUser } from "@zeyla/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { closeSocket } from "../realtime/socket";
import { completeOnboarding, getMe, logout, syncSession } from "./api";
import {
  cacheSupabaseToken,
  clearStoredToken,
  readStoredToken,
  storeToken,
} from "./session";
import { supabase } from "./supabaseClient";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** False when the Supabase keys are missing — only phone OTP is offered then. */
  supabaseEnabled: boolean;
  refresh: () => Promise<AuthUser | null>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (
    email: string,
    password: string,
    name?: string,
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  signInWithGoogle: () => Promise<void>;
  /** Adopts a token from this API's own phone OTP flow. */
  adoptApiSession: (token: string) => Promise<AuthUser | null>;
  finishOnboarding: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * One source of truth for "who is signed in", across all three ways in:
 * Supabase email/password, Supabase Google, and this API's phone OTP.
 *
 * Whichever route was taken, the app ends up with a bearer token and a Zeyla
 * `AuthUser` — including `onboardingCompleted`, which is what the route guard
 * reads. Nothing else in the app should call the auth endpoints directly.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const inFlight = useRef<Promise<AuthUser | null> | null>(null);

  const load = useCallback(async (): Promise<AuthUser | null> => {
    const supabaseSession = supabase
      ? (await supabase.auth.getSession()).data.session
      : null;
    cacheSupabaseToken(supabaseSession?.access_token ?? null);

    if (!supabaseSession && !readStoredToken()) {
      setUser(null);
      setStatus("anonymous");
      return null;
    }

    try {
      // A Supabase token may belong to an account this API has never seen, so
      // it is exchanged rather than merely read. An OTP token always has a row
      // behind it already.
      const next = supabaseSession ? (await syncSession()).user : await getMe();
      setUser(next);
      setStatus("authenticated");
      return next;
    } catch {
      // Expired or revoked. Drop it rather than leaving the app in a state
      // where every request 401s.
      clearStoredToken();
      setUser(null);
      setStatus("anonymous");
      return null;
    }
  }, []);

  /** Collapses overlapping refreshes — a sign-in fires several at once. */
  const refresh = useCallback((): Promise<AuthUser | null> => {
    inFlight.current ??= load().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [load]);

  useEffect(() => {
    void refresh();

    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Covers silent refreshes too, so the synchronous token readers never
      // hand out an access token Supabase has already rotated.
      cacheSupabaseToken(session?.access_token ?? null);
      // Deferred on purpose: calling back into the Supabase client from inside
      // this callback can deadlock its internal lock.
      setTimeout(() => void refresh(), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => {
    function requireSupabase() {
      if (!supabase) throw new Error("email_and_google_signin_unavailable");
      return supabase;
    }

    return {
      status,
      user,
      supabaseEnabled: supabase !== null,
      refresh,

      async signInWithPassword(email, password) {
        const { error } = await requireSupabase().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(error.message);
        await refresh();
      },

      async signUpWithPassword(email, password, name) {
        const { data, error } = await requireSupabase().auth.signUp({
          email: email.trim(),
          password,
          options: { data: name ? { full_name: name.trim() } : undefined },
        });
        if (error) throw new Error(error.message);

        // With email confirmation switched on in the Supabase project, signUp
        // returns a user but no session — there is nothing to sign in with
        // until they click the link.
        if (!data.session) return { needsEmailConfirmation: true };

        await refresh();
        return { needsEmailConfirmation: false };
      },

      async signInWithGoogle() {
        const { error } = await requireSupabase().auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw new Error(error.message);
        // Success navigates away to Google; nothing after this runs.
      },

      async adoptApiSession(token) {
        storeToken(token);
        return refresh();
      },

      async finishOnboarding() {
        const next = await completeOnboarding();
        setUser(next);
        setStatus("authenticated");
        return next;
      },

      async signOut() {
        await logout();
        clearStoredToken();
        if (supabase) await supabase.auth.signOut();
        // The socket authenticated as the outgoing user and sits in their
        // rooms. Dropping it forces the next sign-in to re-handshake rather
        // than inheriting the last account's notifications.
        closeSocket();
        setUser(null);
        setStatus("anonymous");
      },
    };
  }, [refresh, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
