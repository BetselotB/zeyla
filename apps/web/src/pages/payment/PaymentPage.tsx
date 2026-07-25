import { BookingSummary } from "./components/BookingSummary";
import { EmptyBookingState } from "./components/EmptyBookingState";
import { EscrowReturnScreen } from "./components/EscrowReturnScreen";
import "./PaymentPage.css";
import type { BookingSummaryData } from "./types";

/**
 * We pass our own return_url when funding a contract (see BookingSummary),
 * pointing back at this same page with ?contract=<id> appended — so this one
 * page doubles as both the booking/checkout screen and the return_url
 * handler, without needing a second <Route> entry in the shared App.tsx. The
 * backend's own default return_url would land on /payment/return instead;
 * we override it specifically to avoid needing that extra route.
 *
 * TODO(daniel/discovery): booking details currently come from the URL query
 * string (providerId, providerName, description, amount, currency) as a
 * deep-link contract. Once the discovery/booking flow exists, replace this
 * with whatever it actually passes (route state, a booking id to fetch, etc).
 */
export function PaymentPage() {
  const params = new URLSearchParams(window.location.search);
  const contractId = params.get("contract");

  if (contractId) {
    return (
      <main className="payment">
        <header className="payment__topbar">
          <span className="payment__wordmark">Zeyla</span>
        </header>
        <section className="payment__card">
          <EscrowReturnScreen contractId={contractId} />
        </section>
      </main>
    );
  }

  const booking: BookingSummaryData = {
    providerId: params.get("providerId") ?? "",
    providerName: params.get("providerName") ?? "Service provider",
    description: params.get("description") ?? "",
    amount: Number(params.get("amount") ?? 0),
    currency: params.get("currency") ?? "ETB",
  };
  const hasBooking = Boolean(booking.providerId && booking.amount > 0);

  return (
    <main className="payment">
      <header className="payment__topbar">
        <span className="payment__wordmark">Zeyla</span>
      </header>
      <section className="payment__card">
        <h2 className="payment__card-heading">{hasBooking ? "Confirm your payment" : "Booking summary"}</h2>
        {hasBooking ? <BookingSummary booking={booking} /> : <EmptyBookingState />}
      </section>
    </main>
  );
}
