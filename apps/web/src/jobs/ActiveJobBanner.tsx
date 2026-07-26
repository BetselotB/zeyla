import { useState } from "react";
import { Link } from "react-router-dom";
import type { ActiveJobSummary } from "@zeyla/shared";
import "./jobs.css";

interface ActiveJobBannerProps {
  job: ActiveJobSummary;
  href: string;
  isCancelling: boolean;
  error: string | null;
  onCancel: () => void;
}

/** What the customer still has to do before Zeyla will take another request. */
function nextStep(job: ActiveJobSummary): { title: string; body: string } {
  const status = job.request.status;
  const provider = job.providerName ?? "your provider";

  if (status === "pending" || status === "pinged") {
    return {
      title: "We're still finding you a provider",
      body: "Nobody has taken this job yet. Cancel it if you've changed your mind, and you can describe a new problem straight away.",
    };
  }
  if (!job.payment) {
    return {
      title: `${provider} is waiting on payment`,
      body: "Fund the escrow to get the work started. Your money is held by Zeyla, not sent to the provider, until you confirm the job is done.",
    };
  }
  if (job.payment.status === "disputed") {
    return {
      title: "This job is under review",
      body: "Your payment stays in escrow until the dispute is settled. You can't start a new job while it's open.",
    };
  }
  if (job.payment.status === "active") {
    return {
      title: `${provider} is working on it`,
      body: "Confirm the job is done on the tracking screen and your payment is released. That also frees you up to book again.",
    };
  }
  if (job.isPaid) {
    return {
      title: "Your payment is secured",
      body: `${job.payment.amount.toLocaleString()} ${job.payment.currency} is held by Zeyla. Confirm when ${provider} arrives, then again when the work is finished.`,
    };
  }
  return {
    title: "Your payment hasn't cleared yet",
    body: "If you finished checkout this can take a few seconds to settle. Open the job to watch it land.",
  };
}

/**
 * The one-job-at-a-time gate.
 *
 * Shown in place of the intake form, because offering someone a search box
 * they are not allowed to use is worse than not offering it: this says what is
 * blocking them and gives them both ways out — finish it, or cancel it.
 */
export function ActiveJobBanner({
  job,
  href,
  isCancelling,
  error,
  onCancel,
}: ActiveJobBannerProps) {
  const [confirming, setConfirming] = useState(false);
  const step = nextStep(job);
  const category = job.request.category.replace(/_/g, " ");

  return (
    <section className="aj-gate" aria-label="Your active job">
      <header className="aj-gate__head">
        <span className="aj-gate__badge">One job at a time</span>
        <span className="aj-gate__ref">#{job.request.id.slice(0, 8)}</span>
      </header>

      <h2 className="aj-gate__title">{step.title}</h2>
      <p className="aj-gate__body">{step.body}</p>

      <dl className="aj-gate__facts">
        <div>
          <dt>Job</dt>
          <dd className="aj-gate__cap">{category}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{job.providerName ?? "Not assigned yet"}</dd>
        </div>
        <div>
          <dt>Escrow</dt>
          <dd>
            {job.payment
              ? `${job.payment.amount.toLocaleString()} ${job.payment.currency} · ${job.payment.escrowStatus ?? job.payment.status}`
              : "Not funded"}
          </dd>
        </div>
      </dl>

      {error && (
        <p className="z-error aj-gate__error" role="alert">
          {error === "completed_job_cannot_be_cancelled"
            ? "This job is already finished — leave a review instead."
            : "We couldn't cancel that. Try again."}
        </p>
      )}

      <div className="aj-gate__actions">
        <Link to={href} className="z-btn z-btn-primary">
          {job.isPaid ? "Finish this job" : "Open this job"}
        </Link>

        {confirming ? (
          <div className="aj-gate__confirm">
            <p>
              {job.isPaid
                ? "Cancelling a paid job opens a payment dispute. Sure?"
                : "Cancel this request and start over?"}
            </p>
            <div className="aj-gate__confirm-row">
              <button
                type="button"
                className="z-btn z-btn-danger"
                disabled={isCancelling}
                onClick={onCancel}
              >
                {isCancelling ? "Cancelling…" : "Yes, cancel it"}
              </button>
              <button
                type="button"
                className="z-btn z-btn-ghost"
                disabled={isCancelling}
                onClick={() => setConfirming(false)}
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="z-btn z-btn-ghost"
            onClick={() => setConfirming(true)}
          >
            Cancel this request
          </button>
        )}
      </div>
    </section>
  );
}
