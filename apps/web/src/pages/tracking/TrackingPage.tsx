import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth";
import { JobPaymentPanel, useJobPayment, type PaymentViewer } from "../../escrow";
import { getProvider, getRequest } from "../discovery/lib/api.js";
import type { ProviderSummary, ServiceRequestDto } from "../discovery/lib/types.js";
import { AppNav } from "../../components/AppNav.js";
import { cancelRequest } from "../../jobs/useActiveJob.js";
import "../../jobs/jobs.css";
import { LiveMap, useSocketLocation } from "./components/LiveMap.js";
import { MapLegend } from "./components/MapLegend.js";
import { ProviderInfo } from "./components/ProviderInfo.js";
import { StatusTimeline } from "./components/StatusTimeline.js";
import { AnimatedMeshBg } from "../discovery/components/AnimatedMeshBg.js";
import "../discovery/discovery.css";
import "./tracking.css";

const PROVIDER_START: [number, number] = [8.9806, 38.7578];

/**
 * Progress along the timeline, which tracks the job *and* the money: an
 * accepted request that has not been paid for has not really started, so it
 * does not advance past step 1 until escrow confirms the funds.
 */
function stepIndex(status: ServiceRequestDto["status"], isPaid: boolean) {
  if (status === "cancelled") return -1;
  if (status === "pending" || status === "pinged") return 0;
  if (status === "completed") return 3;
  return isPaid ? 2 : 1;
}

export function TrackingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const requestId = params.get("requestId") ?? "";
  const providerId = params.get("providerId") ?? "";

  const [provider, setProvider] = useState<ProviderSummary | null>(null);
  const [request, setRequest] = useState<ServiceRequestDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const {
    payment,
    contract,
    isLoading: isPaymentLoading,
    isBusy,
    start,
    complete,
  } = useJobPayment(requestId || null);

  // GPS is filed against a contract, so there is nothing to follow until the
  // customer has started checkout.
  const { position: providerPos, isLive } = useSocketLocation(
    contract?.id ?? null,
    PROVIDER_START,
  );

  useEffect(() => {
    if (!providerId) return;
    getProvider(providerId)
      .then(setProvider)
      .catch(() => setProvider(null));
  }, [providerId]);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;

    async function poll() {
      try {
        const { request: data } = await getRequest(requestId);
        if (cancelled) return false;
        setRequest(data);
        // Stop polling once the outcome can no longer change on its own.
        return ["completed", "cancelled"].includes(data.status);
      } catch {
        if (!cancelled) setError("Could not load request status.");
        return false;
      }
    }

    poll();
    const interval = setInterval(async () => {
      if (await poll()) clearInterval(interval);
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [requestId]);

  // The customer's own pin comes from the request, which stores the GPS point
  // the search actually ran from.
  const userPos: [number, number] = request
    ? [request.lat, request.lng]
    : [9.0054, 38.7636];

  // Both parties open this same screen. Identity decides the wording, and it
  // is read from the contract or the request rather than from the account
  // role, so a provider paying for someone else's job still sees the payer's
  // side of it.
  const viewer: PaymentViewer = (() => {
    if (payment && user) {
      return payment.providerId === user.id ? "provider" : "customer";
    }
    if (request && user) {
      return request.userId === user.id ? "customer" : "provider";
    }
    return user?.role === "provider" ? "provider" : "customer";
  })();

  const isPaid = payment?.isPaid === true;
  const currentStep = request ? stepIndex(request.status, isPaid) : 0;
  const isDeclined = request?.status === "cancelled";
  const isCompleted =
    request?.status === "completed" || payment?.status === "completed";
  const hasAccepted =
    request?.status === "accepted" || request?.status === "in_progress";

  const reviewsUrl = `/reviews?requestId=${requestId}&providerId=${providerId}`;
  const payUrl = `/payment?requestId=${requestId}${
    providerId ? `&providerId=${providerId}` : ""
  }`;

  async function handleCancel() {
    if (isCancelling) return;
    setIsCancelling(true);
    setCancelError(null);
    try {
      const updated = await cancelRequest(requestId);
      setRequest(updated);
      setConfirmCancel(false);
      navigate("/discovery", { replace: true });
    } catch (err) {
      setCancelError(
        err instanceof Error && err.message === "completed_job_cannot_be_cancelled"
          ? "This job is already finished — leave a review instead."
          : "We couldn't cancel this job. Try again.",
      );
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="tracking-root">
      <AnimatedMeshBg />
      <div className="tr-page z-page-enter-stagger">
        <AppNav
          backTo={viewer === "provider" ? "/provider" : "/discovery"}
          backLabel={viewer === "provider" ? "Dashboard" : "Find help"}
        />

        <header className="tr-hero">
          <div className="tr-badges">
            <span className="tr-badge-dark">Live tracking</span>
            <span className="tr-badge-light">Real-time ›</span>
          </div>
          <h1>
            {viewer === "provider"
              ? isPaid
                ? "You're covered — the customer has paid"
                : "Your next job"
              : "Your provider is on the way"}
          </h1>
          <p>
            {viewer === "provider"
              ? "Funds are held by Zeyla and released to you when the customer confirms the work is done."
              : "Watch their location update in real time while your request is active."}
          </p>
          <div className="tr-request-pill">
            Request <strong>#{requestId.slice(0, 8)}</strong>
            {provider?.name && (
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
              <LiveMap userPos={userPos} providerPos={providerPos} />
            </div>
            <MapLegend isSimulated={!isLive} />
          </div>

          <aside className="tr-sidebar">
            <ProviderInfo
              provider={provider}
              requestId={requestId}
              status={request?.status ?? null}
            />

            <JobPaymentPanel
              payment={payment}
              viewer={viewer}
              canPay={hasAccepted}
              payHref={payUrl}
              isLoading={isPaymentLoading}
              isBusy={isBusy}
              onStart={start}
              onComplete={complete}
            />

            <StatusTimeline currentStep={currentStep} isDeclined={isDeclined} />

            <div className="tr-actions-card">
              {isCompleted && (
                <button
                  type="button"
                  className="z-btn z-btn-primary"
                  onClick={() => navigate(reviewsUrl)}
                >
                  Leave a review
                  <span className="z-btn-arrow" aria-hidden="true">
                    <svg viewBox="0 0 12 12" strokeWidth="2">
                      <path d="M6 9V3M6 3L3 6M6 3L9 6" />
                    </svg>
                  </span>
                </button>
              )}
              {currentStep === 0 && !isDeclined && (
                <p className="tr-step-desc" style={{ margin: 0, textAlign: "center" }}>
                  Waiting for provider to accept…
                </p>
              )}

              {/* The other way out. Until this job is finished or cancelled,
                  Zeyla will not take a new request from this customer. */}
              {viewer === "customer" && !isCompleted && !isDeclined && (
                <>
                  {cancelError && (
                    <p className="z-error" role="alert">
                      {cancelError}
                    </p>
                  )}
                  {confirmCancel ? (
                    <>
                      <p className="tr-step-desc" style={{ margin: 0 }}>
                        {isPaid
                          ? "Cancelling now opens a payment dispute over the held funds."
                          : "This closes the request so you can describe a new problem."}
                      </p>
                      <button
                        type="button"
                        className="z-btn z-btn-danger"
                        disabled={isCancelling}
                        onClick={() => void handleCancel()}
                      >
                        {isCancelling ? "Cancelling…" : "Yes, cancel this job"}
                      </button>
                      <button
                        type="button"
                        className="z-btn z-btn-ghost"
                        disabled={isCancelling}
                        onClick={() => setConfirmCancel(false)}
                      >
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="z-btn z-btn-ghost"
                      onClick={() => setConfirmCancel(true)}
                    >
                      Cancel this job
                    </button>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
