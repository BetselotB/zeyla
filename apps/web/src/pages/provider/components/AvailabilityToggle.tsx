import { useEffect, useState } from "react";
import type { AvailabilityStatus, ProviderAvailability } from "@zeyla/shared";
import { formatDuration, formatRadius, formatRelativeTime } from "../lib/format";

interface AvailabilityToggleProps {
  availability: ProviderAvailability;
  isPending: boolean;
  isConnected: boolean;
  onChange: (status: AvailabilityStatus) => void;
}

const COPY: Record<
  AvailabilityStatus,
  { label: string; headline: string; detail: string }
> = {
  offline: {
    label: "Offline",
    headline: "You're offline",
    detail:
      "Customers nearby can't see you and no job requests will reach you. Go online to start receiving work.",
  },
  online: {
    label: "Online",
    headline: "You're online",
    detail: "You're on the map. New jobs in your area will come straight to this screen.",
  },
  busy: {
    label: "On a job",
    headline: "You're on a job",
    detail:
      "You stay hidden from new requests until this one is finished, so nobody books you twice.",
  },
};

/**
 * The switch this whole screen exists for.
 *
 * Deliberately the largest thing on the page and the only filled control: a
 * provider glancing at their phone between jobs has to be able to tell whether
 * they are earning from across the room, and fix it in one tap.
 */
export function AvailabilityToggle({
  availability,
  isPending,
  isConnected,
  onChange,
}: AvailabilityToggleProps) {
  const { status } = availability;
  const isOnline = status === "online";
  const copy = COPY[status];

  // The server's figure is a snapshot; this keeps the shift timer honest
  // between refreshes instead of freezing until the next fetch.
  const [seconds, setSeconds] = useState(availability.onlineSecondsToday);
  useEffect(() => {
    setSeconds(availability.onlineSecondsToday);
    if (status === "offline") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [availability.onlineSecondsToday, status]);

  return (
    <section className={`pv-toggle pv-toggle--${status}`} aria-live="polite">
      <div className="pv-toggle__body">
        <span className="pv-toggle__status">
          <span className="pv-toggle__dot" aria-hidden="true" />
          {copy.label}
        </span>
        <h2 className="pv-toggle__headline">{copy.headline}</h2>
        <p className="pv-toggle__detail">{copy.detail}</p>

        <dl className="pv-toggle__facts">
          <div>
            <dt>Online today</dt>
            <dd>{formatDuration(seconds)}</dd>
          </div>
          <div>
            <dt>Service area</dt>
            <dd>{formatRadius(availability.serviceRadiusMeters)} radius</dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd>{formatRelativeTime(availability.lastSeenAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="pv-toggle__control">
        <button
          type="button"
          className="pv-switch"
          role="switch"
          aria-checked={isOnline}
          aria-label={isOnline ? "Go offline" : "Go online"}
          disabled={isPending || status === "busy"}
          onClick={() => onChange(isOnline ? "offline" : "online")}
        >
          <span className="pv-switch__track">
            <span className="pv-switch__knob" />
          </span>
        </button>

        <span className="pv-toggle__action">
          {isPending
            ? "Updating…"
            : status === "busy"
              ? "Finish the job to reopen"
              : isOnline
                ? "Tap to stop receiving jobs"
                : "Tap to start receiving jobs"}
        </span>

        {status !== "offline" && (
          <span
            className={`pv-toggle__wire${isConnected ? " is-live" : ""}`}
            title={
              isConnected
                ? "Connected — job requests arrive instantly"
                : "Reconnecting — requests may arrive late"
            }
          >
            {isConnected ? "Live" : "Reconnecting…"}
          </span>
        )}
      </div>
    </section>
  );
}
