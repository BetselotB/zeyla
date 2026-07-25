import { useEffect, useState } from "react";
import { computeTrustScore, type ApiResponse } from "@zeyla/shared";

type HealthData = {
  service: string;
  demoMode: boolean;
  checks: { db: boolean; redis: boolean };
};

export function StatusPanel() {
  const [health, setHealth] = useState<ApiResponse<HealthData> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL ?? "";
    fetch(`${base}/api/health`)
      .then(async (r) => {
        setHealth((await r.json()) as ApiResponse<HealthData>);
      })
      .catch(() => {
        setError("API offline — run `pnpm dev:api` (and `pnpm db:up` for DB/Redis)");
      });
  }, []);

  const sampleTrust = computeTrustScore({
    completedContracts: 5,
    avgRating: 4.5,
    kycVerified: true,
    firecrawlMatched: false,
    flagsReceived: 0,
  });

  return (
    <>
      <section className="status" aria-live="polite">
        <h2>Team status</h2>
        {error && <p className="warn">{error}</p>}
        {health?.data && (
          <ul>
            <li>API: {health.success ? "up" : "degraded"}</li>
            <li>Postgres: {health.data.checks.db ? "up" : "down"}</li>
            <li>Redis: {health.data.checks.redis ? "up" : "down"}</li>
            <li>Demo mode: {health.data.demoMode ? "on" : "off"}</li>
          </ul>
        )}
        {!health && !error && <p>Checking API…</p>}
      </section>

      <section className="preview">
        <h2>Trust score preview</h2>
        <p>
          Sample provider score: <strong>{sampleTrust.total}</strong>
        </p>
        <p className="muted">
          Core IP lives in <code>packages/shared</code> +{" "}
          <code>apps/api/src/modules/escrow</code>
        </p>
      </section>
    </>
  );
}
