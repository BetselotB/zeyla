import type { Provider } from "../../discovery/lib/types.js";
import type { ServiceRequest } from "../../discovery/lib/types.js";

interface ProviderInfoProps {
  provider: Provider | undefined;
  requestId: number;
  status: ServiceRequest["status"] | null;
}

function statusLabel(status: ServiceRequest["status"] | null) {
  switch (status) {
    case "sent":
    case "matched":
    case "draft":
      return "Waiting for response";
    case "accepted":
      return "On the way";
    case "completed":
      return "Job completed";
    case "declined":
      return "Declined";
    case "cancelled":
      return "Cancelled";
    default:
      return "Tracking…";
  }
}

export function ProviderInfo({ provider, requestId, status }: ProviderInfoProps) {
  return (
    <section className="tr-provider-card">
      <p className="tr-section-label">Your provider</p>
      {provider ? (
        <>
          <div className="tr-provider-row">
            <div className="tr-provider-avatar" aria-hidden="true">
              {provider.name.charAt(0)}
            </div>
            <div>
              <p className="tr-provider-name">
                {provider.name}
                {provider.is_verified && (
                  <span className="tr-verified">Verified</span>
                )}
              </p>
              <p className="tr-provider-meta">
                {provider.category} · {provider.location_area}
              </p>
            </div>
            <div className={`z-trust-ring high tr-provider-score`}>
              {provider.trust_score}
            </div>
          </div>
          <div className="tr-provider-stats">
            <span>★ {provider.avg_rating.toFixed(1)}</span>
            <span>{provider.avg_response_minutes} min response</span>
            <span>{provider.jobs_completed} jobs</span>
          </div>
        </>
      ) : (
        <p className="tr-provider-meta">Provider #{requestId}</p>
      )}
      <div className="tr-status-chip">{statusLabel(status)}</div>
    </section>
  );
}
