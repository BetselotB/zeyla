import { useState } from "react";
import type { Provider } from "../lib/types.js";
import type { TrustBreakdown } from "../lib/types.js";
import { getTrustBreakdown } from "../lib/api.js";

interface ProviderCardProps {
  provider: Provider;
  onRequest: (providerId: number) => void;
  requesting?: boolean;
}

function trustRingClass(score: number) {
  if (score >= 85) return "high";
  if (score >= 70) return "mid";
  return "low";
}

export function ProviderCard({
  provider,
  onRequest,
  requesting,
}: ProviderCardProps) {
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
      const data = await getTrustBreakdown(provider.id);
      setBreakdown(data);
      setExpanded(true);
    } finally {
      setLoadingBreakdown(false);
    }
  }

  return (
    <article
      className={`z-provider-card${provider.is_boosted ? " boosted" : ""}`}
    >
      <div>
        <h3 className="z-provider-name">
          {provider.name}
          {provider.is_verified && (
            <span className="z-verified" style={{ marginLeft: "0.5rem" }}>
              ✓ Verified
            </span>
          )}
        </h3>
        <div className="z-provider-meta">
          <span style={{ textTransform: "capitalize" }}>{provider.category}</span>
          <span>{provider.location_area}</span>
          <span className="z-stars">★ {provider.avg_rating.toFixed(1)}</span>
          <span>
            {provider.price_min}–{provider.price_max} ETB
          </span>
          <span>{provider.avg_response_minutes} min response</span>
        </div>
        <p className="z-provider-bio">{provider.bio}</p>
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
        <span
          className={`z-trust-ring ${trustRingClass(provider.trust_score)}`}
        >
          {provider.trust_score}
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
