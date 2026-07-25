import { useEffect, useState } from "react";
import { computeTrustScore } from "@zeyla/shared";
import "./App.css";

type Health = {
  ok: boolean;
  service: string;
  demoMode: boolean;
  checks: { db: boolean; redis: boolean };
};

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL ?? "";
    fetch(`${base}/api/health`)
      .then(async (r) => {
        const data = (await r.json()) as Health;
        setHealth(data);
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
    <main className="shell">
      <header className="brand">
        <p className="mark">Zeyla</p>
        <h1>Trusted local services</h1>
        <p className="lede">
          Hackathon starter — escrow + trust score first. Everything else can be
          simulated for the demo.
        </p>
      </header>

      <section className="status" aria-live="polite">
        <h2>Team status</h2>
        {error && <p className="warn">{error}</p>}
        {health && (
          <ul>
            <li>API: {health.ok ? "up" : "degraded"}</li>
            <li>Postgres: {health.checks.db ? "up" : "down"}</li>
            <li>Redis: {health.checks.redis ? "up" : "down"}</li>
            <li>Demo mode: {health.demoMode ? "on" : "off"}</li>
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
    </main>
  );
}
