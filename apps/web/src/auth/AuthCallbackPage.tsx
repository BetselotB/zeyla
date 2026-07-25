import { Link, Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { AuthSplash } from "./AuthSplash";

/**
 * Where Google sends the browser back to.
 *
 * The Supabase client picks the session out of the URL on its own
 * (`detectSessionInUrl`), so this page only has to wait for AuthProvider to
 * notice and then forward. A denied consent screen comes back here too, with
 * the reason in the query string or the hash.
 */
function readOAuthError(): string | null {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const description =
    search.get("error_description") ?? hash.get("error_description");
  const code = search.get("error") ?? hash.get("error");
  return description ?? code;
}

export function AuthCallbackPage() {
  const { status, user } = useAuth();
  const oauthError = readOAuthError();

  if (oauthError) {
    return (
      <AuthSplash label="Sign-in didn't complete" detail={oauthError}>
        <Link className="onboarding__button" to="/onboarding">
          Back to sign in
        </Link>
      </AuthSplash>
    );
  }

  if (status === "loading") {
    return <AuthSplash label="Finishing sign-in…" />;
  }

  if (status === "anonymous") {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <Navigate to={user?.onboardingCompleted ? "/discovery" : "/onboarding"} replace />
  );
}
