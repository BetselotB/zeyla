import { Link } from "react-router-dom";
import { GlassNavShell } from "../../discovery/components/GlassNavShell.js";
import { ZeylaLogo } from "../../discovery/components/ZeylaLogo.js";

interface ReviewsNavProps {
  backTo: string;
  backLabel?: string;
}

export function ReviewsNav({
  backTo,
  backLabel = "Back to tracking",
}: ReviewsNavProps) {
  return (
    <GlassNavShell>
      <Link to={backTo} className="rv-back">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 3L5 8l5 5" />
        </svg>
        {backLabel}
      </Link>
      <ZeylaLogo className="rv-logo" />
      <span className="rv-nav-spacer" aria-hidden="true" />
    </GlassNavShell>
  );
}
