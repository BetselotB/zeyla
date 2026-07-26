import { useEffect, useState } from "react";
import type { ProviderPingDto } from "@zeyla/shared";
import {
  categoryLabel,
  formatCountdown,
  formatDistance,
  secondsUntil,
} from "../lib/format";

interface IncomingJobAlertProps {
  ping: ProviderPingDto;
  isPending: boolean;
  onRespond: (pingId: string, action: "accepted" | "declined") => void;
  onDismiss: () => void;
}

/**
 * The interruption.
 *
 * A ping that only appears in a list is a ping the provider misses while their
 * phone is in a pocket, so the newest one takes over the screen until it is
 * answered or it runs out. Dismissing leaves it in the inbox rather than
 * declining it — closing a popup is not a refusal.
 */
export function IncomingJobAlert({
  ping,
  isPending,
  onRespond,
  onDismiss,
}: IncomingJobAlertProps) {
  const [remaining, setRemaining] = useState(() => secondsUntil(ping.expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      const next = secondsUntil(ping.expiresAt);
      setRemaining(next);
      if (next === null && ping.expiresAt !== null) onDismiss();
    }, 1000);
    return () => clearInterval(timer);
  }, [ping.expiresAt, onDismiss]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className="pv-alert" role="dialog" aria-modal="true" aria-label="New job request">
      <div className="pv-alert__scrim" onClick={onDismiss} />
      <div className="pv-alert__card">
        <span className="pv-alert__pulse" aria-hidden="true" />
        <p className="pv-alert__eyebrow">New job request</p>
        <h2 className="pv-alert__title">{categoryLabel(ping.request.category)}</h2>
        <p className="pv-alert__where">
          {formatDistance(ping.distanceMeters)}
          {ping.request.addressLabel && ` · ${ping.request.addressLabel}`}
        </p>

        <p className="pv-alert__desc">
          {ping.request.description ??
            ping.request.voiceTranscript ??
            "The customer didn't add a description."}
        </p>

        {remaining !== null && (
          <p className="pv-alert__timer">
            Respond within <strong>{formatCountdown(remaining)}</strong>
          </p>
        )}

        <div className="pv-alert__actions">
          <button
            type="button"
            className="z-btn z-btn-ghost"
            disabled={isPending}
            onClick={() => onRespond(ping.id, "declined")}
          >
            Decline
          </button>
          <button
            type="button"
            className="z-btn z-btn-primary"
            disabled={isPending}
            onClick={() => onRespond(ping.id, "accepted")}
          >
            {isPending ? "Accepting…" : "Accept job"}
          </button>
        </div>

        <button type="button" className="pv-alert__later" onClick={onDismiss}>
          Decide later
        </button>
      </div>
    </div>
  );
}
