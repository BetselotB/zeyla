import { useState } from "react";
import { createEscrowCheckout } from "../api";
import type { BookingSummaryData } from "../types";

type BookingSummaryProps = {
  booking: BookingSummaryData;
};

/**
 * Read-only booking summary + "Pay & Fund Escrow" button. Creating the
 * checkout always goes through our own backend (which wraps Chapa's
 * initialize call server-side) — the browser only ever receives a
 * checkoutUrl to redirect to, never a Chapa secret key.
 */
export function BookingSummary({ booking }: BookingSummaryProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}`;
      const result = await createEscrowCheckout({
        providerId: booking.providerId,
        description: booking.description,
        amount: booking.amount,
        currency: booking.currency,
        returnUrl,
      });
      window.location.assign(result.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start checkout. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="payment__form">
      <dl className="payment__summary">
        <div>
          <dt>Provider</dt>
          <dd>{booking.providerName}</dd>
        </div>
        <div>
          <dt>Service</dt>
          <dd>{booking.description}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd className="payment__amount">
            {booking.amount.toLocaleString()} {booking.currency}
          </dd>
        </div>
      </dl>

      {error && (
        <p className="payment__notice payment__notice--error" role="alert">
          {error}
        </p>
      )}

      <button className="payment__button" disabled={isSubmitting} type="button" onClick={handlePay}>
        {isSubmitting ? "Redirecting to checkout…" : "Pay & Fund Escrow"}
      </button>
      <p className="payment__hint">
        You'll be redirected to Chapa's secure checkout. Zeyla never sees or stores your card or wallet details, and
        your payment stays in escrow until the work is complete.
      </p>
    </div>
  );
}
