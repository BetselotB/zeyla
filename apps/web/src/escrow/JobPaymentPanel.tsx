import type { JobPaymentSummary } from "@zeyla/shared";
import "./escrow.css";

export type PaymentViewer = "customer" | "provider";

type Tone = "waiting" | "pending" | "paid" | "attention";

/** A lifecycle move the viewer is allowed to make from this state. */
type Action = { kind: "start" | "complete"; label: string };

interface Copy {
  tone: Tone;
  label: string;
  title: string;
  body: string;
  /** Link out to checkout. Payer only. */
  cta?: string;
  action?: Action;
}

interface JobPaymentPanelProps {
  payment: JobPaymentSummary | null;
  viewer: PaymentViewer;
  /** False until a provider has taken the job — there is nothing to fund yet. */
  canPay: boolean;
  payHref: string;
  isLoading: boolean;
  isBusy?: boolean;
  onStart?: () => void;
  onComplete?: () => void;
}

function money(payment: JobPaymentSummary): string {
  return `${payment.amount.toLocaleString()} ${payment.currency}`;
}

/**
 * The wording for every state the money can be in, for both parties.
 *
 * Kept as one function so the two sides cannot drift apart: the provider must
 * never be told the customer has paid while the customer is still being asked
 * to pay, and both read the same summary off the same contract.
 */
function copyFor(
  payment: JobPaymentSummary | null,
  viewer: PaymentViewer,
  canPay: boolean,
): Copy {
  const isCustomer = viewer === "customer";

  if (!payment) {
    if (!canPay) {
      return {
        tone: "waiting",
        label: "Escrow",
        title: "Payment starts once a provider accepts",
        body: "Nothing is charged while you're still waiting for someone to take the job.",
      };
    }
    return isCustomer
      ? {
          tone: "pending",
          label: "Action needed",
          title: "Fund escrow to get started",
          body: "Your money is held by Zeyla, not sent to the provider, until you confirm the job is done.",
          cta: "Pay with Chapa",
        }
      : {
          tone: "waiting",
          label: "Awaiting payment",
          title: "Waiting for the customer to pay",
          body: "This turns green the moment their payment clears. Funds stay in escrow until the job is complete.",
        };
  }

  if (payment.escrowStatus === "refunded") {
    return {
      tone: "attention",
      label: "Refunded",
      title: "This payment was refunded",
      body: isCustomer
        ? `${money(payment)} has been returned to you.`
        : "The held funds were returned to the customer.",
    };
  }

  if (payment.status === "disputed") {
    return {
      tone: "attention",
      label: "Disputed",
      title: "This job is under review",
      body: `${money(payment)} stays in escrow until the dispute is resolved.`,
    };
  }

  if (payment.escrowStatus === "released" || payment.status === "completed") {
    return {
      tone: "paid",
      label: "Released",
      title: isCustomer ? "Payment released" : "You've been paid",
      body: isCustomer
        ? `${money(payment)} has been released to your provider. Thanks for using Zeyla.`
        : `${money(payment)} has been released to you, minus the platform fee.`,
    };
  }

  if (payment.status === "active") {
    return isCustomer
      ? {
          tone: "paid",
          label: "In progress",
          title: "Work is under way",
          body: `${money(payment)} stays in escrow until you confirm the job is done.`,
          action: { kind: "complete", label: "Confirm done & release payment" },
        }
      : {
          tone: "paid",
          label: "In progress",
          title: "Work is under way",
          body: `${money(payment)} is held for you. The customer releases it once they confirm the work is done.`,
        };
  }

  if (payment.isPaid) {
    return isCustomer
      ? {
          tone: "paid",
          label: "Paid",
          title: "Your payment is secured",
          body: `${money(payment)} is held by Zeyla. Confirm when your provider arrives and the job can begin.`,
          action: { kind: "start", label: "My provider has arrived" },
        }
      : {
          tone: "paid",
          label: "Paid",
          title: "The customer has paid",
          body: `${money(payment)} is held in escrow for this job. It's released to you once the customer confirms the work is done.`,
          action: { kind: "start", label: "Start the job" },
        };
  }

  // A contract exists but no signed webhook has confirmed the money yet.
  return isCustomer
    ? {
        tone: "pending",
        label: "Not confirmed",
        title: "Your payment hasn't cleared yet",
        body: "If you finished checkout this can take a few seconds to settle. This updates on its own.",
        cta: "Continue payment",
      }
    : {
        tone: "waiting",
        label: "Awaiting payment",
        title: "The customer has started checkout",
        body: "Their payment hasn't cleared yet. You'll see it here the moment it does.",
      };
}

/**
 * Escrow status for one job, from the perspective of whoever is looking.
 *
 * This is the surface the Chapa webhook ultimately drives: the transition it
 * triggers server-side arrives here over the socket, and both parties' panels
 * flip to "paid" without either of them reloading.
 */
export function JobPaymentPanel({
  payment,
  viewer,
  canPay,
  payHref,
  isLoading,
  isBusy = false,
  onStart,
  onComplete,
}: JobPaymentPanelProps) {
  if (isLoading && !payment) {
    return (
      <section className="esc-panel esc-panel--waiting">
        <span className="esc-panel__label">Escrow</span>
        <p className="esc-panel__title">Checking payment status…</p>
      </section>
    );
  }

  const copy = copyFor(payment, viewer, canPay);
  const handler = copy.action?.kind === "start" ? onStart : onComplete;
  const showAction = copy.action !== undefined && handler !== undefined;

  return (
    <section className={`esc-panel esc-panel--${copy.tone}`}>
      <header className="esc-panel__head">
        <span className="esc-panel__label">{copy.label}</span>
        {payment && <span className="esc-panel__amount">{money(payment)}</span>}
      </header>

      <p className="esc-panel__title">{copy.title}</p>
      <p className="esc-panel__body">{copy.body}</p>

      {copy.cta && viewer === "customer" && (
        <a className="z-btn z-btn-primary esc-panel__cta" href={payHref}>
          {copy.cta}
        </a>
      )}

      {showAction && (
        <button
          type="button"
          className="z-btn z-btn-primary esc-panel__cta"
          disabled={isBusy}
          onClick={handler}
        >
          {isBusy ? "Working…" : copy.action!.label}
        </button>
      )}

      {copy.tone === "paid" && (
        <p className="esc-panel__note">Confirmed by Chapa · held by Zeyla escrow</p>
      )}
    </section>
  );
}
