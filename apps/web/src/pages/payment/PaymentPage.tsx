import { BookingSummary } from "./components/BookingSummary";
import { EmptyBookingState } from "./components/EmptyBookingState";
import { EscrowReturnScreen } from "./components/EscrowReturnScreen";
import "./PaymentPage.css";
import type { BookingSummaryData } from "./types";

/**
 * Chapa redirects back to this same page with ?tx_ref=... appended to
 * whatever return_url we gave it — so this one page doubles as both the
 * booking/checkout screen and the return_url handler, without needing a
 * second <Route> entry in the shared App.tsx.
 *
 * TODO(daniel/discovery): booking details currently come from the URL query
 * string (providerId, providerName, description, amount, currency) as a
 * deep-link contract. Once the discovery/booking flow exists, replace this
 * with whatever it actually passes (route state, a booking id to fetch, etc).
 */
export function PaymentPage() {
  const params = new URLSearchParams(window.location.search);
  const txRef = params.get("tx_ref");

  if (txRef) {
    return (
      <main className="payment">
        <header className="payment__topbar">
          <span className="payment__wordmark">Zeyla</span>
        </header>
        <section className="payment__card">
          <EscrowReturnScreen txRef={txRef} />
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
