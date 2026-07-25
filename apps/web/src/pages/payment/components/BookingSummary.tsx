import { useEffect, useState } from "react";
import { createContract, fundContract } from "../api";
import type { Booking } from "../types";

type BookingSummaryProps = {
  booking: Booking;
  /** False while the session check is still resolving. */
  isReady: boolean;
  prefillEmail: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Turns "appliance_repair" into "Appliance repair" for display. */
function humanise(slug: string) {
  const spaced = slug.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Booking line items, the agreed price, the receipt email, and the button that
 * starts checkout.
 *
 * Creating the contract and funding it both go through our own backend (which
 * wraps Chapa's initialize call server-side) — the browser only ever receives
 * a checkoutUrl to redirect to, never a Chapa key.
 *
 * The amount is editable because no endpoint carries an agreed price yet (see
 * the TODO in useBooking.ts). When one exists, prefill it and make this
 * read-only rather than asking the customer to retype what was agreed.
 */
export function BookingSummary({ booking, isReady, prefillEmail }: BookingSummaryProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(prefillEmail);
  const [amount, setAmount] = useState(booking.amount > 0 ? String(booking.amount) : "");

  useEffect(() => {
    if (prefillEmail) setEmail(prefillEmail);
  }, [prefillEmail]);

  const parsedAmount = Number(amount);
  const isAmountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const handlePay = async () => {
    setError(null);
    if (!isAmountValid) {
      setError("Enter the amount you agreed with the provider.");
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Enter a valid email so we can send your receipt.");
      return;
    }

    setIsSubmitting(true);
    try {
      const contract = await createContract({
        requestId: booking.requestId,
        providerId: booking.providerId,
        agreedAmount: parsedAmount,
        currency: booking.currency,
        title: booking.description || humanise(booking.category),
      });
      const returnUrl = `${window.location.origin}${window.location.pathname}?contract=${contract.id}`;
      const result = await fundContract(contract.id, { returnUrl, email: email.trim() });
      window.location.assign(result.checkoutUrl);
    } catch (checkoutError) {
      const code = checkoutError instanceof Error ? checkoutError.message : "";
      if (code === "email_required_for_checkout" || code === "invalid_email") {
        setError("Chapa needs a real, deliverable email address for the receipt.");
      } else if (code === "missing_bearer_token" || code === "invalid_or_expired_token") {
        setError("Your session expired. Please sign in again.");
      } else if (code.startsWith("cannot_fund_contract_in_status")) {
        setError("This booking has already been paid for.");
      } else {
        setError("We couldn't start checkout. Please try again.");
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div className="payment__form">
      <div>
        <p className="payment__label">Booking</p>
        <dl className="payment__summary">
          <div>
            <dt>Provider</dt>
            <dd>{booking.providerName}</dd>
          </div>
          <div>
            <dt>Service</dt>
            <dd>{booking.description || humanise(booking.category)}</dd>
          </div>
          {booking.addressLabel && (
            <div>
              <dt>Where</dt>
              <dd>{booking.addressLabel}</dd>
            </div>
          )}
          {isAmountValid && (
            <div className="payment__total">
              <dt>Total</dt>
              <dd className="payment__amount">
                {parsedAmount.toLocaleString()} {booking.currency}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <label className="payment__field">
        <span>Agreed amount ({booking.currency})</span>
        <input
          type="number"
          inputMode="decimal"
          min="1"
          step="1"
          value={amount}
          placeholder="850"
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>

      <label className="payment__field">
        <span>Receipt email</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          placeholder="you@example.com"
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      {error && (
        <p className="payment__notice payment__notice--error" role="alert">
          {error}
        </p>
      )}

      <button className="payment__button" disabled={isSubmitting || !isReady} type="button" onClick={handlePay}>
        {isSubmitting ? "Opening checkout…" : "Pay and fund escrow"}
      </button>

      <p className="payment__hint">
        You'll finish payment on Chapa's secure checkout. Zeyla never sees your card or wallet details, and the money
        stays in escrow until the job is done.
      </p>
    </div>
  );
}
