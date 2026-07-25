import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Classification } from "../lib/types.js";
import type { Provider } from "../lib/types.js";
import { listProviders, matchProvider } from "../lib/api.js";
import { ProviderCard } from "./ProviderCard.js";

interface ProviderResultsProps {
  classification: Classification;
  requestId: number;
}

export function ProviderResults({
  classification,
  requestId,
}: ProviderResultsProps) {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listProviders({
          category: classification.service_category,
        });
        if (!cancelled) {
          setProviders(
            [...data].sort((a, b) => b.trust_score - a.trust_score),
          );
        }
      } catch {
        if (!cancelled) setError("Could not load providers. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classification.service_category]);

  async function handleRequest(providerId: number) {
    setRequestingId(providerId);
    setError(null);
    try {
      await matchProvider(requestId, providerId);
      navigate(`/tracking?requestId=${requestId}&providerId=${providerId}`);
    } catch {
      setError("Could not send request. Please try again.");
    } finally {
      setRequestingId(null);
    }
  }

  return (
    <section className="z-results" id="providers">
      <div className="z-results-header">
        <h2>Trusted providers near you</h2>
        <p>
          Ranked by trust score · {classification.service_category} ·{" "}
          {classification.urgency} urgency
        </p>
      </div>

      {error && <div className="z-error">{error}</div>}

      {loading ? (
        <div className="z-loading">Finding nearby providers…</div>
      ) : providers.length === 0 ? (
        <div className="z-empty">
          No providers found nearby. Try a different category or check back
          later.
        </div>
      ) : (
        <div className="z-provider-list">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              onRequest={handleRequest}
              requesting={requestingId === p.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
