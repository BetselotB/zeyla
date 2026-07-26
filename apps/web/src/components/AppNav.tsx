import { Link, useLocation, useNavigate } from "react-router-dom";
import type { AvailabilityStatus } from "@zeyla/shared";
import { useAuth } from "../auth/AuthProvider";
import { useActiveJob } from "../jobs/useActiveJob";
import { GlassNavShell } from "../pages/discovery/components/GlassNavShell";
import { ZeylaLogo } from "../pages/discovery/components/ZeylaLogo";
import "./appnav.css";

const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  offline: "Offline",
  online: "Online",
  busy: "On a job",
};

interface AppNavProps {
  /**
   * Provider availability, when the host page already knows it. Rendered as the
   * status pill so a provider can see they are offline from any scroll
   * position.
   */
  status?: AvailabilityStatus;
  /** Adds a back arrow on the left, for the screens reached from somewhere. */
  backTo?: string;
  backLabel?: string;
}

interface NavLink {
  to: string;
  label: string;
}

/**
 * The single navigation bar, told apart by who is signed in.
 *
 * A provider and a customer want opposite things from the same app — one is
 * looking for work, the other for someone to do it — so the links are chosen
 * from the account's role rather than from the page. Signed-out visitors get
 * the marketing set, which is the only case where nothing personal is known.
 */
export function AppNav({ status, backTo, backLabel = "Back" }: AppNavProps) {
  const { user, status: authStatus, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isProvider = user?.role === "provider";
  const isSignedIn = authStatus === "authenticated";

  // Only the customer side is gated on having a job open, so a provider never
  // pays for this lookup.
  const { activeJob, href } = useActiveJob({ enabled: isSignedIn && !isProvider });

  const links: NavLink[] = !isSignedIn
    ? [
        { to: "/product", label: "Product" },
        { to: "/providers", label: "Providers" },
        { to: "/use-cases", label: "Use Cases" },
        { to: "/pricing", label: "Pricing" },
      ]
    : isProvider
      ? [
          { to: "/provider", label: "Dashboard" },
          { to: "/provider#earnings", label: "Earnings" },
          { to: "/discovery", label: "Hire someone" },
        ]
      : [
          { to: "/discovery", label: "Find help" },
          ...(href ? [{ to: href, label: "My job" }] : []),
          { to: "/payment", label: "Payments" },
        ];

  async function handleSignOut() {
    await signOut();
    navigate("/onboarding", { replace: true });
  }

  return (
    <GlassNavShell>
      {backTo ? (
        <Link to={backTo} className="nv-back">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          {backLabel}
        </Link>
      ) : (
        <ZeylaLogo />
      )}

      <ul className="z-nav-links">
        {links.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              className={pathname === link.to.split("#")[0] ? "nv-link--current" : undefined}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="z-nav-cta nv-cta">
        {status && (
          <span className={`pv-pill pv-pill--${status}`}>
            <span className="pv-pill__dot" aria-hidden="true" />
            {AVAILABILITY_LABELS[status]}
          </span>
        )}

        {/* The customer's standing obligation, visible from every screen. */}
        {!isProvider && activeJob && href && (
          <Link to={href} className="nv-job-pill">
            <span className="nv-job-pill__dot" aria-hidden="true" />
            {activeJob.isPaid ? "Job in progress" : "Job open"}
          </Link>
        )}

        {isSignedIn ? (
          <div className="nv-account">
            <span className="nv-account__name">
              {user?.name?.split(" ")[0] ?? (isProvider ? "Provider" : "You")}
            </span>
            <button
              type="button"
              className="nv-signout"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link to="/onboarding" className="z-btn z-btn-primary">
            Get Started
          </Link>
        )}
      </div>
    </GlassNavShell>
  );
}
