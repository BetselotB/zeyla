import { useState } from "react";
import { getTrustBreakdown } from "../lib/api.js";
import type { ProviderMatch, TrustBreakdown } from "../lib/types.js";

interface ProviderCardProps {
  match: ProviderMatch;
  onRequest: (providerId: string) => void;
  requesting?: boolean;
}

function trustRingClass(score: number) {
  if (score >= 85) return "high";
  if (score >= 70) return "mid";
  return "low";
}

export function ProviderCard({ match, onRequest, requesting }: ProviderCardProps) {
  const { provider, reason, rank } = match;
  const [expanded, setExpanded] = useState(false);
  const [breakdown, setBreakdown] = useState<TrustBreakdown | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  async function toggleBreakdown() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setLoadingBreakdown(true);
    try {
      setBreakdown(await getTrustBreakdown(provider.id));
      setExpanded(true);
    } catch {
      // The score itself is already on the badge; the breakdown is a bonus.
    } finally {
      setLoadingBreakdown(false);
    }
  }

  return (
    <article className={`z-provider-card${rank === 1 ? " boosted" : ""}`}>
      <div>
        <h3 className="z-provider-name">
          {provider.name ?? "Unnamed provider"}
          {provider.kycStatus === "verified" && (
            <span className="z-verified" style={{ marginLeft: "0.5rem" }}>
              ✓ Verified
            </span>
          )}
          {rank === 1 && (
            <span className="z-verified" style={{ marginLeft: "0.5rem" }}>
              Best match
            </span>
          )}
        </h3>
        <div className="z-provider-meta">
          <span style={{ textTransform: "capitalize" }}>
            {provider.category.replace(/_/g, " ")}
          </span>
          <span>{(provider.distanceMeters / 1000).toFixed(1)} km away</span>
          {provider.avgRating !== null && (
            <span className="z-stars">
              ★ {provider.avgRating.toFixed(1)} ({provider.reviewCount})
            </span>
          )}
          <span>{provider.completedContracts} jobs completed</span>
          {provider.isOnline && <span>Online now</span>}
        </div>

        {/* Why this provider, for this problem. */}
        <p className="z-provider-bio">{reason}</p>
        {provider.bio && (
          <p className="z-provider-bio" style={{ opacity: 0.7 }}>
            {provider.bio}
          </p>
        )}

        <button
          type="button"
          className="z-btn z-btn-primary"
          style={{ marginTop: "0.75rem" }}
          onClick={() => onRequest(provider.id)}
          disabled={requesting}
        >
          {requesting ? "Sending request…" : "Request this provider"}
        </button>
      </div>

      <button
        type="button"
        className="z-trust-badge"
        onClick={toggleBreakdown}
        aria-expanded={expanded}
      >
        <span className={`z-trust-ring ${trustRingClass(provider.trustScore)}`}>
          {Math.round(provider.trustScore)}
        </span>
        <span className="z-trust-label">Trust</span>
      </button>

      {expanded && (
        <div className="z-trust-breakdown">
          {loadingBreakdown ? (
            <p>Loading breakdown…</p>
          ) : breakdown ? (
            <>
              <p>{breakdown.explanation}</p>
              <dl>
                <dt>Base score</dt>
                <dd>{breakdown.base}</dd>
                <dt>Completed jobs bonus</dt>
                <dd>+{breakdown.completedContracts}</dd>
                <dt>Review bonus</dt>
                <dd>+{breakdown.reviewBonus.toFixed(1)}</dd>
                <dt>KYC bonus</dt>
                <dd>+{breakdown.kycBonus}</dd>
                <dt>Flag penalty</dt>
                <dd>{breakdown.flagPenalty}</dd>
                <dt>
                  <strong>Total</strong>
                </dt>
                <dd>
                  <strong>{breakdown.total}</strong>
                </dd>
              </dl>
            </>
          ) : null}
        </div>
      )}
    </article>
  );
}
