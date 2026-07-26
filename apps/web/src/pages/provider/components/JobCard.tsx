import { useEffect, useState } from "react";
import type { ProviderPingDto } from "@zeyla/shared";
import { PaymentBadge } from "../../../escrow";
import {
  categoryLabel,
  formatCountdown,
  formatDistance,
  formatRelativeTime,
  secondsUntil,
} from "../lib/format";

interface JobCardProps {
  ping: ProviderPingDto;
  isPending: boolean;
  onRespond: (pingId: string, action: "accepted" | "declined") => void;
  /** Supplied for jobs already taken, to open the live tracking screen. */
  onOpen?: (ping: ProviderPingDto) => void;
}

/**
 * One job request.
 *
 * The countdown is the point: a ping the provider cannot win any more must stop
 * looking like one they can, otherwise they tap accept and get a conflict.
 */
export function JobCard({ ping, isPending, onRespond, onOpen }: JobCardProps) {
  const [remaining, setRemaining] = useState(() => secondsUntil(ping.expiresAt));

  useEffect(() => {
    setRemaining(secondsUntil(ping.expiresAt));
    if (ping.status !== "sent" && ping.status !== "seen") return;
    const timer = setInterval(
      () => setRemaining(secondsUntil(ping.expiresAt)),
      1000,
    );
    return () => clearInterval(timer);
  }, [ping.expiresAt, ping.status]);

  const answered = ping.status === "accepted" || ping.status === "declined";
  const expired = !answered && remaining === null && ping.expiresAt !== null;
  const isLive = !answered && !expired;
  const isUrgent =
    ping.request.urgency === "emergency" || ping.request.urgency === "high";

  return (
    <article
      className={`pv-job${isUrgent && isLive ? " pv-job--urgent" : ""}${
        isLive ? "" : " pv-job--closed"
      }`}
    >
      <header className="pv-job__head">
        <div>
          <h3 className="pv-job__title">{categoryLabel(ping.request.category)}</h3>
          <p className="pv-job__meta">
            {formatDistance(ping.distanceMeters)}
            {ping.request.addressLabel && (
              <>
                <span aria-hidden="true"> · </span>
                {ping.request.addressLabel}
              </>
            )}
            <span aria-hidden="true"> · </span>
            {formatRelativeTime(ping.sentAt)}
          </p>
        </div>

        {isLive && remaining !== null ? (
          <span
            className={`pv-job__timer${remaining <= 30 ? " is-critical" : ""}`}
            aria-label={`${remaining} seconds left to respond`}
          >
            {formatCountdown(remaining)}
          </span>
        ) : (
          <span className={`pv-job__state pv-job__state--${answered ? ping.status : "expired"}`}>
            {answered ? ping.status : "expired"}
          </span>
        )}
      </header>

      {isUrgent && isLive && (
        <span className="pv-job__flag">
          {ping.request.urgency === "emergency" ? "Emergency" : "Urgent"}
        </span>
      )}

      <p className="pv-job__desc">
        {ping.request.description ??
          ping.request.voiceTranscript ??
          "The customer didn't add a description."}
      </p>

      <footer className="pv-job__foot">
        <span className="pv-job__customer">
          {ping.customerName ?? "A customer"}
        </span>

        <PaymentBadge
          payment={ping.payment}
          isAccepted={ping.status === "accepted"}
        />

        {isLive && (
          <div className="pv-job__actions">
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
              {isPending ? "Sending…" : "Accept job"}
            </button>
          </div>
        )}

        {!isLive && onOpen && (
          <button
            type="button"
            className="z-btn z-btn-ghost"
            onClick={() => onOpen(ping)}
          >
            Open job
          </button>
        )}
      </footer>
    </article>
  );
}
