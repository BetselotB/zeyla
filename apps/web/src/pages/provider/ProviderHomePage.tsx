import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  AvailabilityStatus,
  PresenceChangedEvent,
  ProviderDashboard,
  ProviderPingDto,
} from "@zeyla/shared";
import { AuthSplash } from "../../auth/AuthSplash";
import { AnimatedMeshBg } from "../discovery/components/AnimatedMeshBg.js";
import "../discovery/discovery.css";
import { AvailabilityToggle } from "./components/AvailabilityToggle";
import { IncomingJobAlert } from "./components/IncomingJobAlert";
import { JobCard } from "./components/JobCard";
import { ProviderNav } from "./components/ProviderNav";
import { ServiceArea } from "./components/ServiceArea";
import { ShiftStats } from "./components/ShiftStats";
import * as api from "./lib/api";
import { useProviderRealtime } from "./lib/useProviderRealtime";
import "./provider.css";

/** Often enough that a customer never waits on a stale listing, rarely enough
 *  to be free. The server treats anything older than this as "app is closed". */
const HEARTBEAT_MS = 45_000;

/** Backstop for a socket that dropped without saying so. */
const REFRESH_MS = 30_000;

function readPosition(): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      // Location is a nicety here, not a gate: the sub-city centroid picked at
      // onboarding already puts the provider somewhere findable.
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
    );
  });
}

/**
 * Provider home — where a provider lands after onboarding and returns between
 * jobs.
 *
 * The whole screen is arranged around one question: am I earning right now?
 * The toggle answers it, the inbox is what the answer produces, and the demand
 * panel is the argument for changing it.
 */
export function ProviderHomePage() {
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState<ProviderDashboard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState(false);
  const [pendingPingId, setPendingPingId] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [alertPing, setAlertPing] = useState<ProviderPingDto | null>(null);

  /** Suppresses the backstop refresh from clobbering an in-flight action. */
  const isMutating = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await api.getDashboard();
      setDashboard(next);
      setLoadError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "load_failed";
      // No provider profile means this account is a customer, not that
      // something broke — send them where they can actually do something.
      if (message === "provider_profile") {
        navigate("/discovery", { replace: true });
        return;
      }
      setLoadError(message);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const availability = dashboard?.availability ?? null;
  const status = availability?.status ?? "offline";

  // --- Realtime --------------------------------------------------------------

  const handlePing = useCallback((ping: ProviderPingDto) => {
    setDashboard((current) => {
      if (!current) return current;
      // Sockets can redeliver, and the backstop refresh may have already
      // fetched this ping over REST.
      if (current.inbox.some((entry) => entry.id === ping.id)) return current;
      return {
        ...current,
        inbox: [ping, ...current.inbox],
        stats: {
          ...current.stats,
          pingsReceivedToday: current.stats.pingsReceivedToday + 1,
          pendingPings: current.stats.pendingPings + 1,
        },
      };
    });
    setAlertPing(ping);
  }, []);

  const handlePresence = useCallback((event: PresenceChangedEvent) => {
    // Another tab, or the server switching us to busy on an accept.
    setDashboard((current) =>
      current && current.availability.status !== event.status
        ? {
            ...current,
            availability: { ...current.availability, status: event.status },
          }
        : current,
    );
  }, []);

  // A contract moving is nearly always money: `escrowed` is Chapa's webhook
  // confirming the customer paid. Re-read rather than patch state from the
  // event, so the shift totals move with the job card.
  const handleContractStatus = useCallback(() => {
    if (!isMutating.current) void load();
  }, [load]);

  const { isConnected } = useProviderRealtime({
    onPing: handlePing,
    onPresence: handlePresence,
    onContractStatus: handleContractStatus,
  });

  // --- Keep-alive ------------------------------------------------------------

  useEffect(() => {
    if (status === "offline") return;
    const beat = () => void api.sendHeartbeat().catch(() => undefined);
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isMutating.current) void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // --- Actions ---------------------------------------------------------------

  const changeStatus = useCallback(
    async (next: AvailabilityStatus) => {
      setPendingToggle(true);
      isMutating.current = true;
      setActionError(null);
      try {
        // Going online is the moment the position matters: it decides which
        // customers can reach you. Coming offline doesn't need one.
        const position = next === "online" ? await readPosition() : null;
        const updated = await api.setAvailability({
          status: next,
          ...(position ?? {}),
        });
        setDashboard((current) =>
          current ? { ...current, availability: updated } : current,
        );
        // Demand and the inbox both change meaning with the switch.
        void load();
      } catch (err) {
        setActionError(
          err instanceof Error
            ? "We couldn't update your availability. Check your connection and try again."
            : "Something went wrong.",
        );
      } finally {
        setPendingToggle(false);
        isMutating.current = false;
      }
    },
    [load],
  );

  const providerId = dashboard?.provider.providerId;

  const respond = useCallback(
    async (pingId: string, action: "accepted" | "declined") => {
      setPendingPingId(pingId);
      isMutating.current = true;
      setActionError(null);
      try {
        const { request } = await api.respondToPing(pingId, action);
        setAlertPing((current) => (current?.id === pingId ? null : current));
        await load();
        if (action === "accepted" && providerId) {
          // Same live map the customer is watching, from the other side.
          navigate(`/tracking?requestId=${request.id}&providerId=${providerId}`);
        }
      } catch (err) {
        const code = err instanceof Error ? err.message : "";
        setActionError(
          code === "ping_expired"
            ? "That request timed out before you answered."
            : code === "request_not_open"
              ? "Another provider already took that job."
              : "We couldn't send your answer. Try again.",
        );
        setAlertPing(null);
        void load();
      } finally {
        setPendingPingId(null);
        isMutating.current = false;
      }
    },
    [load, navigate, providerId],
  );

  const updateArea = useCallback(
    async (patch: { serviceRadiusMeters?: number; useLocation?: boolean }) => {
      if (!availability) return;
      isMutating.current = true;
      setActionError(null);
      if (patch.useLocation) setIsLocating(true);
      try {
        const position = patch.useLocation ? await readPosition() : null;
        if (patch.useLocation && !position) {
          setActionError(
            "We couldn't read your location. Allow location access and try again.",
          );
          return;
        }
        // Re-sending the current status is a no-op server-side, so this edits
        // the area without ending or starting a shift.
        const updated = await api.setAvailability({
          status: availability.status,
          serviceRadiusMeters: patch.serviceRadiusMeters,
          ...(position ?? {}),
        });
        setDashboard((current) =>
          current ? { ...current, availability: updated } : current,
        );
        void load();
      } catch {
        setActionError("We couldn't update your service area. Try again.");
      } finally {
        setIsLocating(false);
        isMutating.current = false;
      }
    },
    [availability, load],
  );

  // --- Render ----------------------------------------------------------------

  const { live, active, history } = useMemo(() => {
    const inbox = dashboard?.inbox ?? [];

    const isLive = (ping: ProviderPingDto) =>
      (ping.status === "sent" || ping.status === "seen") &&
      (!ping.expiresAt || new Date(ping.expiresAt).getTime() > Date.now());

    // Taken, not finished. These are the jobs where the payment badge matters,
    // so they get their own section rather than being buried in the history.
    const isActive = (ping: ProviderPingDto) =>
      ping.status === "accepted" &&
      ping.request.status !== "completed" &&
      ping.request.status !== "cancelled";

    return {
      live: inbox.filter(isLive),
      active: inbox.filter(isActive),
      history: inbox
        .filter((ping) => !isLive(ping) && !isActive(ping))
        .slice(0, 6),
    };
  }, [dashboard]);

  const openJob = useCallback(
    (ping: ProviderPingDto) => {
      if (!providerId) return;
      navigate(`/tracking?requestId=${ping.request.id}&providerId=${providerId}`);
    },
    [navigate, providerId],
  );

  if (!dashboard || !availability) {
    if (loadError) {
      return (
        <div className="discovery-root">
          <AnimatedMeshBg />
          <div className="z-page provider-page">
            <ProviderNav status="offline" />
            <section className="z-hero">
              <h1>We couldn't load your dashboard</h1>
              <p>{loadError}</p>
              <button
                type="button"
                className="z-btn z-btn-primary pv-retry"
                onClick={() => void load()}
              >
                Try again
              </button>
            </section>
          </div>
        </div>
      );
    }
    return <AuthSplash label="Opening your dashboard…" />;
  }

  const name = dashboard.provider.businessName ?? "there";

  return (
    <div className="discovery-root">
      <AnimatedMeshBg />
      <div className="z-page z-page-enter-stagger provider-page">
        <ProviderNav status={status} />

        <section className="z-hero pv-hero">
          <div className="z-badges">
            <span className="z-badge z-badge-dark">Provider</span>
            <span className="z-badge z-badge-light">
              {dashboard.provider.category.replace(/_/g, " ")} ›
            </span>
          </div>
          <h1>
            {status === "online"
              ? `You're taking jobs, ${name}`
              : status === "busy"
                ? "You're on a job"
                : `Welcome back, ${name}`}
          </h1>
          <p>
            {status === "online"
              ? "Requests from customers in your area will appear here the moment they come in."
              : "Turn on availability whenever you're ready to work. Nothing reaches you until you do."}
          </p>
        </section>

        <div className="pv-shell">
          {actionError && (
            <p className="z-error pv-error" role="alert">
              {actionError}
            </p>
          )}

          <AvailabilityToggle
            availability={availability}
            isPending={pendingToggle}
            isConnected={isConnected}
            onChange={(next) => void changeStatus(next)}
          />

          <ShiftStats stats={dashboard.stats} />

          <div className="pv-columns">
            <section className="pv-inbox">
              {active.length > 0 && (
                <>
                  <header className="pv-inbox__head">
                    <h2 className="pv-panel__title">Active jobs</h2>
                    <span className="pv-inbox__count">
                      {active.filter((ping) => ping.payment?.isPaid).length} paid
                    </span>
                  </header>
                  <div className="pv-inbox__list">
                    {active.map((ping) => (
                      <JobCard
                        key={ping.id}
                        ping={ping}
                        isPending={false}
                        onRespond={() => undefined}
                        onOpen={openJob}
                      />
                    ))}
                  </div>
                </>
              )}

              <header className="pv-inbox__head">
                <h2 className="pv-panel__title">Job requests</h2>
                {live.length > 0 && (
                  <span className="pv-inbox__count">{live.length} waiting</span>
                )}
              </header>

              {live.length > 0 ? (
                <div className="pv-inbox__list">
                  {live.map((ping) => (
                    <JobCard
                      key={ping.id}
                      ping={ping}
                      isPending={pendingPingId === ping.id}
                      onRespond={(id, action) => void respond(id, action)}
                    />
                  ))}
                </div>
              ) : (
                <div className="pv-inbox__empty">
                  <span className="pv-inbox__empty-icon" aria-hidden="true">
                    {status === "online" ? "◎" : "○"}
                  </span>
                  <p className="pv-inbox__empty-title">
                    {status === "online"
                      ? "Waiting for your next job"
                      : status === "busy"
                        ? "Paused while you finish this job"
                        : "You're not receiving requests"}
                  </p>
                  <p className="pv-inbox__empty-note">
                    {status === "online"
                      ? "You'll hear about new work here as soon as a customer nearby asks for it."
                      : status === "busy"
                        ? "New requests start again once this job is marked complete."
                        : "Go online and customers within your service area can reach you."}
                  </p>
                </div>
              )}

              {history.length > 0 && (
                <>
                  <h3 className="pv-inbox__subhead">Earlier today</h3>
                  <div className="pv-inbox__list">
                    {history.map((ping) => (
                      <JobCard
                        key={ping.id}
                        ping={ping}
                        isPending={false}
                        onRespond={() => undefined}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>

            <aside className="pv-side">
              <ServiceArea
                availability={availability}
                demand={dashboard.demand}
                isPending={pendingToggle}
                isLocating={isLocating}
                onRadiusChange={(meters) =>
                  void updateArea({ serviceRadiusMeters: meters })
                }
                onUseCurrentLocation={() => void updateArea({ useLocation: true })}
              />

              <section className="pv-panel">
                <header className="pv-panel__head">
                  <h2 className="pv-panel__title">Trust score</h2>
                  <span className="pv-panel__value">
                    {Math.round(dashboard.provider.trustScore)}
                  </span>
                </header>
                <p className="pv-panel__note">
                  Customers see this next to your name. Completing jobs and
                  collecting reviews raises it; declining and cancelling does not.
                </p>
              </section>
            </aside>
          </div>
        </div>
      </div>

      {alertPing && (
        <IncomingJobAlert
          ping={alertPing}
          isPending={pendingPingId === alertPing.id}
          onRespond={(id, action) => void respond(id, action)}
          onDismiss={() => setAlertPing(null)}
        />
      )}
    </div>
  );
}
