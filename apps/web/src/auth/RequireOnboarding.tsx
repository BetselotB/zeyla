import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { AuthSplash } from "./AuthSplash";

/**
 * Layout route that stands in front of every page except /onboarding itself.
 *
 * A token is not enough to get through: `onboardingCompleted` only flips once
 * the signup flow reaches its last step, so an account abandoned halfway comes
 * back to where it left off instead of landing in a half-configured app.
 */
export function RequireOnboarding() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <AuthSplash label="Checking your session…" />;
  }

  if (status === "anonymous" || !user?.onboardingCompleted) {
    return (
      <Navigate
        to="/onboarding"
        replace
        // Onboarding sends them back here at the end rather than to the
        // default landing page.
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}
