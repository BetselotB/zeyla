import { BookingSummary } from "./components/BookingSummary";
import { EmptyBookingState } from "./components/EmptyBookingState";
import { EscrowReturnScreen } from "./components/EscrowReturnScreen";
import "./PaymentPage.css";
import type { BookingSummaryData } from "./types";
import { useEscrowReturn, type EscrowReturnState } from "./useEscrowReturn";
import { useViewer } from "./useViewer";

type Copy = { badge: string; ghost: string; title: string; subtitle: string };

const RETURN_COPY: Record<EscrowReturnState, Copy> = {
  checking: {
    badge: "Escrow",
    ghost: "Confirming",
    title: "Confirming your payment",
    subtitle: "We're checking that your funds have been received. This usually takes a second or two.",
  },
  escrowed: {
    badge: "Escrow",
    ghost: "Funds held",
    title: "Your payment is secured",
    subtitle: "The money is held safely by Zeyla and is only released to the provider once the work is done.",
  },
  unpaid: {
    badge: "Escrow",
    ghost: "Not confirmed",
    title: "We couldn't confirm it yet",
    subtitle: "If you completed checkout, it can take a moment to settle. Check again in a few seconds.",
  },
  disputed: {
    badge: "Escrow",
    ghost: "Needs attention",
    title: "This booking needs attention",
    subtitle: "This contract has been flagged for manual review. Contact support and we'll sort it out.",
  },
  error: {
    badge: "Escrow",
    ghost: "Error",
    title: "We couldn't load this booking",
    subtitle: "Something went wrong reaching your booking. Check your connection and try again.",
  },
};

function PaymentShell({ copy, children, backHref }: { copy: Copy; children: React.ReactNode; backHref?: string }) {
  return (
    <main className="payment">
      <nav className="payment__nav">
        {backHref && (
          <a className="payment__nav-action" href={backHref}>
            ‹ Back
          </a>
        )}
        <span className="payment__brand">
          <span className="payment__logo">Z</span>
          <span className="payment__wordmark">Zeyla</span>
        </span>
      </nav>

      <header className="payment__hero">
        <div className="payment__badges">
          <span className="payment__badge">{copy.badge}</span>
          <span className="payment__badge payment__badge--ghost">{copy.ghost}</span>
        </div>
        <h1 className="payment__title">{copy.title}</h1>
        <p className="payment__subtitle">{copy.subtitle}</p>
      </header>

      <section className="payment__card">{children}</section>

      <p className="payment__footnote">Escrow protected · Chapa secured · Addis Ababa</p>
    </main>
  );
}

/** Return leg: kept separate so the polling hook only runs on this branch. */
function EscrowReturn({ contractId }: { contractId: string }) {
  const state = useEscrowReturn(contractId);

  return (
    <PaymentShell copy={RETURN_COPY[state]}>
      <EscrowReturnScreen state={state} />
    </PaymentShell>
  );
}

/**
 * We pass our own return_url when funding a contract (see BookingSummary),
 * pointing back at this same page with ?contract=<id> appended — so this one
 * page doubles as both the checkout screen and the return_url handler, without
 * needing a second <Route> entry in the shared App.tsx. The backend's own
 * default return_url would land on /payment/return instead; we override it
 * specifically to avoid needing that extra route.
 *
 * TODO(daniel/discovery): booking details currently come from the URL query
 * string (providerId, providerName, description, amount, currency) as a
 * deep-link contract. Once the discovery/booking flow exists, replace this
 * with whatever it actually passes (route state, a booking id to fetch, etc).
 */
export function PaymentPage() {
  const params = new URLSearchParams(window.location.search);
  const contractId = params.get("contract");

  if (contractId) return <EscrowReturn contractId={contractId} />;

  return <Checkout params={params} />;
}

function Checkout({ params }: { params: URLSearchParams }) {
  const { isSignedIn, user } = useViewer();

  const booking: BookingSummaryData = {
    providerId: params.get("providerId") ?? "",
    providerName: params.get("providerName") ?? "Service provider",
    description: params.get("description") ?? "",
    amount: Number(params.get("amount") ?? 0),
    currency: params.get("currency") ?? "ETB",
  };
  const hasBooking = Boolean(booking.providerId && booking.amount > 0);

  if (!hasBooking) {
    return (
      <PaymentShell
        copy={{
          badge: "Escrow",
          ghost: "Nothing to pay",
          title: "No booking to pay for",
          subtitle: "Choose a service and agree a price with a provider first — we'll bring you back here to pay.",
        }}
      >
        <EmptyBookingState />
      </PaymentShell>
    );
  }

  if (isSignedIn === false) {
    return (
      <PaymentShell
        copy={{
          badge: "Escrow",
          ghost: "Sign in required",
          title: "Sign in to pay",
          subtitle: "Verify your phone number first so we know who's funding this booking.",
        }}
      >
        <div className="payment__form">
          <p className="payment__hint">Your booking details are saved — you'll come straight back here afterwards.</p>
          <a className="payment__button" href="/onboarding">
            Sign in to continue
          </a>
        </div>
      </PaymentShell>
    );
  }

  return (
    <PaymentShell
      copy={{
        badge: "Escrow",
        ghost: `${booking.amount.toLocaleString()} ${booking.currency}`,
        title: "Confirm and fund escrow",
        subtitle: "Your payment is held by Zeyla, not sent to the provider, until the job is marked complete.",
      }}
    >
      <BookingSummary booking={booking} isReady={isSignedIn === true} prefillEmail={user?.email ?? ""} />
    </PaymentShell>
  );
}
