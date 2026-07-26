import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { AuthSplash } from "./AuthSplash";

/**
 * Where "/" goes.
 *
 * A provider's home is their availability switch, not the customer search
 * screen — landing them on discovery would mean the app never tells them they
 * are offline. Everyone else goes to discovery as before.
 */
export function RoleLanding() {
  const { status, user } = useAuth();

  if (status === "loading") return <AuthSplash label="Loading Zeyla…" />;
  return <Navigate to={user?.role === "provider" ? "/provider" : "/discovery"} replace />;
}
