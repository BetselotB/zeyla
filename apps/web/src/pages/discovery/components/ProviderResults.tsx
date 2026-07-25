import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMatches, matchProvider } from "../lib/api.js";
import type { MatchResult, ProviderMatch, ServiceRequestDto } from "../lib/types.js";
import { ProviderCard } from "./ProviderCard.js";

interface ProviderResultsProps {
  request: ServiceRequestDto;
}

export function ProviderResults({ request }: ProviderResultsProps) {
  const navigate = useNavigate();
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairingId, setPairingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMatches(request.id);
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setError("Could not load providers. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  async function handleRequest(providerId: string) {
    setPairingId(providerId);
    setError(null);
    try {
      await matchProvider(request.id, providerId);
      navigate(`/tracking?requestId=${request.id}&providerId=${providerId}`);
    } catch {
      setError("Could not send the request. Please try again.");
    } finally {
      setPairingId(null);
    }
  }

  const matches: ProviderMatch[] = result?.matches ?? [];
  const rankedByAi = result?.source === "gemini";

  return (
    <section className="z-results" id="providers">
      <div className="z-results-header">
        <h2>{rankedByAi ? "Best matches for your problem" : "Trusted providers near you"}</h2>
        <p>
          {rankedByAi
            ? "Ranked on fit, trust, and distance"
            : "Ranked by trust score"}{" "}
          · {request.category.replace(/_/g, " ")} · {request.urgency} urgency
          {request.addressLabel ? ` · ${request.addressLabel}` : ""}
        </p>
      </div>

      {error && <div className="z-error">{error}</div>}

      {loading ? (
        <div className="z-loading">Finding the right provider…</div>
      ) : matches.length === 0 ? (
        <div className="z-empty">
          No {request.category.replace(/_/g, " ")} is available near you right
          now. Try widening the area or a different service.
        </div>
      ) : (
        <div className="z-provider-list">
          {matches.map((match) => (
            <ProviderCard
              key={match.provider.id}
              match={match}
              onRequest={handleRequest}
              requesting={pairingId === match.provider.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
