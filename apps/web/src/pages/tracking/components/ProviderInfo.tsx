import type { ProviderSummary, ServiceRequestDto } from "../../discovery/lib/types.js";

interface ProviderInfoProps {
  provider: ProviderSummary | null;
  requestId: string;
  status: ServiceRequestDto["status"] | null;
}

function statusLabel(status: ServiceRequestDto["status"] | null) {
  switch (status) {
    case "pending":
    case "pinged":
      return "Waiting for response";
    case "accepted":
      return "On the way";
    case "in_progress":
      return "Work in progress";
    case "completed":
      return "Job completed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Tracking…";
  }
}

function trustRingClass(score: number) {
  if (score >= 85) return "high";
  if (score >= 70) return "mid";
  return "low";
}

export function ProviderInfo({ provider, requestId, status }: ProviderInfoProps) {
  return (
    <section className="tr-provider-card">
      <p className="tr-section-label">Your provider</p>
      {provider ? (
        <>
          <div className="tr-provider-row">
            <div className="tr-provider-avatar" aria-hidden="true">
              {(provider.name ?? "?").charAt(0)}
            </div>
            <div>
              <p className="tr-provider-name">
                {provider.name ?? "Unnamed provider"}
                {provider.kycStatus === "verified" && (
                  <span className="tr-verified">Verified</span>
                )}
              </p>
              <p className="tr-provider-meta">
                {provider.category.replace(/_/g, " ")} ·{" "}
                {(provider.distanceMeters / 1000).toFixed(1)} km away
              </p>
            </div>
            <div
              className={`z-trust-ring ${trustRingClass(provider.trustScore)} tr-provider-score`}
            >
              {Math.round(provider.trustScore)}
            </div>
          </div>
          <div className="tr-provider-stats">
            {provider.avgRating !== null && (
              <span>★ {provider.avgRating.toFixed(1)}</span>
            )}
            <span>{provider.experienceYears} yrs experience</span>
            <span>{provider.completedContracts} jobs</span>
          </div>
        </>
      ) : (
        <p className="tr-provider-meta">Request #{requestId.slice(0, 8)}</p>
      )}
      <div className="tr-status-chip">{statusLabel(status)}</div>
    </section>
  );
}
