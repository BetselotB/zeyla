import { Link } from "react-router-dom";
import type { AvailabilityStatus } from "@zeyla/shared";
import { GlassNavShell } from "../../discovery/components/GlassNavShell.js";
import { ZeylaLogo } from "../../discovery/components/ZeylaLogo.js";

const LABELS: Record<AvailabilityStatus, string> = {
  offline: "Offline",
  online: "Online",
  busy: "On a job",
};

/**
 * Provider chrome. The status pill sits in the nav as well as on the toggle so
 * it stays visible once the page is scrolled past the switch.
 */
export function ProviderNav({ status }: { status: AvailabilityStatus }) {
  return (
    <GlassNavShell>
      <ZeylaLogo />
      <ul className="z-nav-links">
        <li><Link to="/provider">Dashboard</Link></li>
        <li><Link to="/discovery">Hire someone</Link></li>
        <li><Link to="/pricing">Pricing</Link></li>
      </ul>
      <div className="z-nav-cta">
        <span className={`pv-pill pv-pill--${status}`}>
          <span className="pv-pill__dot" aria-hidden="true" />
          {LABELS[status]}
        </span>
      </div>
    </GlassNavShell>
  );
}
