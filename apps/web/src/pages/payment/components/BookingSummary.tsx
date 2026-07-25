import { useEffect, useState } from "react";
import { createContract, fundContract, getMe } from "../api";
import { getAuthToken } from "../authToken";
import type { BookingSummaryData } from "../types";

type BookingSummaryProps = {
  booking: BookingSummaryData;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Read-only booking summary + "Pay & Fund Escrow" button. Creating the
 * contract and funding it always go through our own backend (which wraps
 * Chapa's initialize call server-side) — the browser only ever receives a
 * checkoutUrl to redirect to, never a Chapa secret key.
 *
 * Chapa requires a receipt email on file; the profile form is the intended
 * place to collect it (see apps/web/src/pages/onboarding), but we still ask
 * here as a fallback for anyone who skipped that step, since fund() accepts
 * a per-transaction override.
 */
export function BookingSummary({ booking }: BookingSummaryProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      setIsSignedIn(false);
      return;
    }
    getMe()
      .then((user) => {
        setIsSignedIn(true);
        if (user.email) setEmail(user.email);
      })
      .catch(() => setIsSignedIn(false));
  }, []);

  const handlePay = async () => {
    setError(null);
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Enter a valid email for your payment receipt.");
      return;
    }
    setIsSubmitting(true);
    try {
      const contract = await createContract({
        providerId: booking.providerId,
        agreedAmount: booking.amount,
        currency: booking.currency,
        title: booking.description || undefined,
      });
      const returnUrl = `${window.location.origin}${window.location.pathname}?contract=${contract.id}`;
      const result = await fundContract(contract.id, { returnUrl, email: email.trim() });
      window.location.assign(result.checkoutUrl);
    } catch (checkoutError) {
      const code = checkoutError instanceof Error ? checkoutError.message : "";
      if (code === "email_required_for_checkout") {
        setError("We need a valid email to receive Chapa's payment receipt — please enter one above.");
      } else if (code === "missing_bearer_token" || code === "invalid_or_expired_token") {
        setIsSignedIn(false);
      } else {
        setError("Unable to start checkout. Please try again.");
      }
      setIsSubmitting(false);
    }
  };

  if (isSignedIn === false) {
    return (
      <div className="payment__form">
        <p className="payment__notice payment__notice--error" role="alert">
          Please sign in before funding escrow.
        </p>
        <a className="payment__button" href="/onboarding">
          Go to sign in
        </a>
      </div>
    );
  }

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

      <button className="payment__button" disabled={isSubmitting || isSignedIn === null} type="button" onClick={handlePay}>
        {isSubmitting ? "Redirecting to checkout…" : "Pay & Fund Escrow"}
      </button>
      <p className="payment__hint">
        You'll be redirected to Chapa's secure checkout. Zeyla never sees or stores your card or wallet details, and
        your payment stays in escrow until the work is complete.
      </p>
    </div>
  );
}
