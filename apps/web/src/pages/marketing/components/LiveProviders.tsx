import { useEffect, useState } from "react";
import type { ProviderSummary } from "@zeyla/shared";
import { fetchProviderPreview } from "../api.js";
import { CATEGORY_LABELS } from "../content.js";

/**
 * A real slice of the marketplace, centred on Addis. If the API is unreachable
 * the whole block disappears rather than showing invented providers — a
 * marketing page that fakes supply is how a demo turns into a lie.
 */
export function LiveProviders() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; providers: ProviderSummary[]; total: number }
    | { status: "unavailable" }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchProviderPreview(6)
      .then(({ providers, total }) => {
        if (cancelled) return;
        setState(
          providers.length > 0
            ? { status: "ready", providers, total }
            : { status: "unavailable" },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "unavailable") return null;

  if (state.status === "loading") {
    return (
      <div className="zm-live" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <div key={key} className="zm-skeleton" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="zm-live">
        {state.providers.map((provider) => (
          <article key={provider.id} className="zm-live-card">
            <div>
              <p className="zm-live-name">{provider.name ?? "Zeyla provider"}</p>
              <p className="zm-live-meta">
                {CATEGORY_LABELS[provider.category as keyof typeof CATEGORY_LABELS] ??
                  provider.category}
                {" · "}
                {(provider.distanceMeters / 1000).toFixed(1)} km
                {provider.completedContracts > 0 && ` · ${provider.completedContracts} jobs`}
              </p>
            </div>
            <span className={`zm-live-score${provider.trustScore < 70 ? " mid" : ""}`}>
              {Math.round(provider.trustScore)}
            </span>
          </article>
        ))}
      </div>
      <p className="zm-note">
        {state.total} provider{state.total === 1 ? "" : "s"} within 50 km of Meskel
        Square right now. Scores are live from the trust engine.
      </p>
    </>
  );
}
