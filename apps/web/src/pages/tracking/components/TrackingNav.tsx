import { Link } from "react-router-dom";
import { GlassNavShell } from "../../discovery/components/GlassNavShell.js";
import { ZeylaLogo } from "../../discovery/components/ZeylaLogo.js";

interface TrackingNavProps {
  backTo?: string;
  backLabel?: string;
}

export function TrackingNav({
  backTo = "/discovery",
  backLabel = "Back to home",
}: TrackingNavProps) {
  return (
    <GlassNavShell>
      <Link to={backTo} className="tr-back">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 3L5 8l5 5" />
        </svg>
        {backLabel}
      </Link>
      <ZeylaLogo className="tr-logo" />
      <span className="tr-live-badge">
        <span className="tr-live-dot" aria-hidden="true" />
        Live
      </span>
    </GlassNavShell>
  );
}
