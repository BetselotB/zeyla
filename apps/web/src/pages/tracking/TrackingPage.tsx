import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getRequest } from "../discovery/lib/api.js";
import { MOCK_PROVIDERS } from "../discovery/lib/mockData.js";
import type { ServiceRequest } from "../discovery/lib/types.js";
import { LiveMap, useSocketLocation } from "./components/LiveMap.js";
import { MapLegend } from "./components/MapLegend.js";
import { ProviderInfo } from "./components/ProviderInfo.js";
import { StatusTimeline } from "./components/StatusTimeline.js";
import { TrackingNav } from "./components/TrackingNav.js";
import { AnimatedMeshBg } from "../discovery/components/AnimatedMeshBg.js";
import "../discovery/discovery.css";
import "./tracking.css";

const USER_POS: [number, number] = [9.0054, 38.7636];
const PROVIDER_START: [number, number] = [8.9806, 38.7578];

function stepIndex(status: ServiceRequest["status"]) {
  if (status === "declined" || status === "cancelled") return -1;
  if (status === "sent" || status === "matched" || status === "draft") return 0;
  if (status === "accepted") return 1;
  if (status === "completed") return 2;
  return 0;
}

export function TrackingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const requestId = Number(params.get("requestId") ?? "100");
  const providerId = Number(params.get("providerId") ?? "1");
  const contractId = String(requestId);

  const provider = MOCK_PROVIDERS.find((p) => p.id === providerId);
  const { position: providerPos, isLive } = useSocketLocation(
    contractId,
    PROVIDER_START,
  );

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await getRequest(requestId);
        if (!cancelled) {
          setRequest(data);
          if (
            ["accepted", "declined", "completed", "cancelled"].includes(
              data.status,
            )
          ) {
            return true;
          }
        }
      } catch {
        if (!cancelled) setError("Could not load request status.");
      }
      return false;
    }

    poll();
    const interval = setInterval(async () => {
      const done = await poll();
      if (done) clearInterval(interval);
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [requestId]);

  useEffect(() => {
    if (request?.status === "sent") {
      const t = setTimeout(() => {
        setRequest((r) => (r ? { ...r, status: "accepted" } : r));
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [request?.status]);

  const currentStep = request ? stepIndex(request.status) : 0;
  const isDeclined = request?.status === "declined";
  const isCompleted = request?.status === "completed";
  const reviewsUrl = `/reviews?requestId=${requestId}&providerId=${providerId}`;

  return (
    <div className="tracking-root">
      <AnimatedMeshBg />
      <div className="tr-page z-page-enter-stagger">
        <TrackingNav />

        <header className="tr-hero">
          <div className="tr-badges">
            <span className="tr-badge-dark">Live tracking</span>
            <span className="tr-badge-light">Real-time ›</span>
          </div>
          <h1>Your provider is on the way</h1>
          <p>
            Watch their location update in real time while your request is
            active.
          </p>
          <div className="tr-request-pill">
            Request <strong>#{requestId}</strong>
            {provider && (
              <>
                <span aria-hidden="true">·</span>
                <strong>{provider.name}</strong>
              </>
            )}
          </div>
        </header>

        {error && <div className="z-error">{error}</div>}

        <div className="tr-grid">
          <div className="tr-map-card">
            <div className="tr-map-wrap">
              <LiveMap userPos={USER_POS} providerPos={providerPos} />
            </div>
            <MapLegend isSimulated={!isLive} />
          </div>

          <aside className="tr-sidebar">
            <ProviderInfo
              provider={provider}
              requestId={requestId}
              status={request?.status ?? null}
            />

            <StatusTimeline
              currentStep={currentStep}
              isDeclined={isDeclined}
            />

            <div className="tr-actions-card">
              {(isCompleted || currentStep >= 1) && (
                <button
                  type="button"
                  className="z-btn z-btn-primary"
                  onClick={() => navigate(reviewsUrl)}
                >
                  {isCompleted ? "Leave a review" : "Preview review"}
                  <span className="z-btn-arrow" aria-hidden="true">
                    <svg viewBox="0 0 12 12" strokeWidth="2">
                      <path d="M6 9V3M6 3L3 6M6 3L9 6" />
                    </svg>
                  </span>
                </button>
              )}
              {currentStep >= 1 && !isCompleted && (
                <button
                  type="button"
                  className="z-btn z-btn-ghost"
                  onClick={() =>
                    setRequest((r) => (r ? { ...r, status: "completed" } : r))
                  }
                >
                  Mark completed (demo)
                </button>
              )}
              {currentStep === 0 && !isDeclined && (
                <p className="tr-step-desc" style={{ margin: 0, textAlign: "center" }}>
                  Waiting for provider to accept…
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
