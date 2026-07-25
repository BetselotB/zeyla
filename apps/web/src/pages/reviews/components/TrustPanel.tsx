import type { TrustBreakdown } from "../../discovery/lib/types.js";

function ringClass(score: number) {
  if (score >= 85) return "high";
  if (score >= 70) return "mid";
  return "low";
}

interface TrustPanelProps {
  breakdown: TrustBreakdown;
  providerName?: string;
}

export function TrustPanel({ breakdown, providerName }: TrustPanelProps) {
  const rows = [
    { label: "Base score", value: breakdown.base, sign: "" },
    { label: "Completed jobs", value: breakdown.completedContracts, sign: "+" },
    { label: "Review bonus", value: breakdown.reviewBonus.toFixed(1), sign: "+" },
    { label: "KYC verified", value: breakdown.kycBonus, sign: "+" },
    { label: "Flag penalty", value: breakdown.flagPenalty, sign: "" },
  ];

  return (
    <section className="rv-trust-panel">
      <div className="rv-trust-top">
        <div>
          <p className="rv-section-label">Trust score</p>
          {providerName && (
            <p className="rv-trust-name">{providerName}</p>
          )}
        </div>
        <div className={`z-trust-ring ${ringClass(breakdown.total)} rv-trust-ring`}>
          {breakdown.total}
        </div>
      </div>

      <p className="rv-trust-explain">{breakdown.explanation}</p>

      <div className="rv-trust-bars">
        {rows.map((row) => (
          <div key={row.label} className="rv-trust-row">
            <span className="rv-trust-row-label">{row.label}</span>
            <span className="rv-trust-row-value">
              {row.sign}{row.value}
            </span>
          </div>
        ))}
      </div>

      <div className="rv-trust-total">
        <span>Total</span>
        <strong>{breakdown.total}</strong>
      </div>
    </section>
  );
}
