import { Link } from "react-router-dom";
import { AnimatedMeshBg } from "../../discovery/components/AnimatedMeshBg.js";
import "../../discovery/discovery.css";
import "../reviews.css";

export function ReviewSuccess() {
  return (
    <div className="reviews-root">
      <AnimatedMeshBg />
      <div className="rv-page z-page-enter-stagger">
        <div className="rv-success">
          <div className="rv-success-ring" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1>Thank you!</h1>
          <p>
            Your review helps build trust across Zeyla. Providers with great
            ratings get more requests.
          </p>
          <Link to="/discovery" className="z-btn z-btn-primary">
            Back to home
            <span className="z-btn-arrow" aria-hidden="true">
              <svg viewBox="0 0 12 12" strokeWidth="2">
                <path d="M6 9V3M6 3L3 6M6 3L9 6" />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
