import type { JobPaymentSummary } from "@zeyla/shared";
import "./escrow.css";

interface PaymentBadgeProps {
  payment: JobPaymentSummary | null;
  /** Hidden entirely before a provider has accepted, when there is nothing to owe. */
  isAccepted: boolean;
}

/**
 * Compact "has the customer paid?" marker for a job in a list.
 *
 * Renders nothing on a job nobody has accepted: an unanswered ping showing
 * "unpaid" would read as a problem rather than as the normal state.
 */
export function PaymentBadge({ payment, isAccepted }: PaymentBadgeProps) {
  if (!isAccepted) return null;

  if (payment?.escrowStatus === "refunded" || payment?.status === "disputed") {
    return (
      <span className="esc-badge esc-badge--attention">
        <span className="esc-badge__dot" aria-hidden="true" />
        {payment.escrowStatus === "refunded" ? "Refunded" : "Disputed"}
      </span>
    );
  }

  if (payment?.escrowStatus === "released") {
    return (
      <span className="esc-badge esc-badge--paid">
        <span className="esc-badge__dot" aria-hidden="true" />
        Paid out
      </span>
    );
  }

  if (payment?.isPaid) {
    return (
      <span
        className="esc-badge esc-badge--paid"
        title={`${payment.amount.toLocaleString()} ${payment.currency} held in escrow`}
      >
        <span className="esc-badge__dot" aria-hidden="true" />
        Customer paid
      </span>
    );
  }

  return (
    <span className="esc-badge esc-badge--awaiting">
      <span className="esc-badge__dot" aria-hidden="true" />
      Awaiting payment
    </span>
  );
}
