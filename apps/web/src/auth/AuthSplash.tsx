import { AnimatedMeshBg } from "../pages/discovery/components/AnimatedMeshBg.js";
import { DiscoveryNav } from "../pages/discovery/components/DiscoveryNav.js";
import "../pages/discovery/discovery.css";
import "./auth.css";

/**
 * Shown while the session is being resolved, and on the OAuth return trip.
 * Uses the discovery page frame so a redirect never flashes an unstyled page
 * between two glass screens.
 */
export function AuthSplash({
  label,
  detail,
  children,
}: {
  label: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="discovery-root">
      <AnimatedMeshBg />
      <div className="z-page auth-splash">
        <DiscoveryNav />
        <div className="z-glass-card auth-splash__card">
          <div className="z-glass-inner">
            <div className="auth-splash__spinner" aria-hidden="true" />
            <p className="auth-splash__label">{label}</p>
            {detail && <p className="auth-splash__detail">{detail}</p>}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
