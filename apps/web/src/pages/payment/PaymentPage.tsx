import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { BookingSummary } from "./components/BookingSummary";
import { EmptyBookingState } from "./components/EmptyBookingState";
import { EscrowReturnScreen } from "./components/EscrowReturnScreen";
import "./PaymentPage.css";
import { useBooking } from "./useBooking";
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

function PaymentShell({ copy, children }: { copy: Copy; children: ReactNode }) {
  return (
    <main className="payment">
      <nav className="payment__nav">
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
 * Entered from the booking flow as `?requestId=<id>` once a provider has
 * accepted the ping — accepting deliberately does not create a contract, the
 * customer side starts escrow (see apps/api/src/modules/marketplace/API.md).
 * An optional `?providerId=` and `?amount=` may be passed as hints.
 *
 * We also pass our own return_url when funding, pointing back here with
 * ?contract=<id>, so this one page doubles as the return_url handler without
 * needing a second <Route> in the shared App.tsx.
 */
export function PaymentPage() {
  const [params] = useSearchParams();
  const contractId = params.get("contract");

  if (contractId) return <EscrowReturn contractId={contractId} />;

  return <Checkout params={params} />;
}

function Checkout({ params }: { params: URLSearchParams }) {
  const { isSignedIn, user } = useViewer();
  const { state, booking } = useBooking(params);

  if (state === "missing" || state === "error") {
    return (
      <PaymentShell
        copy={
          state === "missing"
            ? {
                badge: "Escrow",
                ghost: "Nothing to pay",
                title: "No booking to pay for",
                subtitle: "Choose a service and agree a price with a provider first — we'll bring you back here to pay.",
              }
            : {
                badge: "Escrow",
                ghost: "Error",
                title: "We couldn't load this booking",
                subtitle: "Something went wrong fetching your request. Check your connection and try again.",
              }
        }
      >
        <EmptyBookingState />
      </PaymentShell>
    );
  }

  if (state === "not-accepted") {
    return (
      <PaymentShell
        copy={{
          badge: "Escrow",
          ghost: "Waiting",
          title: "No provider has accepted yet",
          subtitle: "You can fund escrow as soon as someone takes the job. We'll keep your request open.",
        }}
      >
        <div className="payment__form">
          <a className="payment__button payment__button--secondary" href="/tracking">
            Back to tracking
          </a>
        </div>
      </PaymentShell>
    );
  }

  if (state === "loading" || !booking) {
    return (
      <PaymentShell
        copy={{
          badge: "Escrow",
          ghost: "Loading",
          title: "Loading your booking",
          subtitle: "Fetching the job details and the provider who accepted it.",
        }}
      >
        <div className="payment__form">
          <div className="payment__status">
            <span className="payment__status-icon payment__status-icon--pending">•••</span>
          </div>
        </div>
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
          <p className="payment__hint">Your booking is saved — you'll come straight back here afterwards.</p>
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
        ghost: booking.providerName,
        title: "Confirm and fund escrow",
        subtitle: "Your payment is held by Zeyla, not sent to the provider, until the job is marked complete.",
      }}
    >
      <BookingSummary booking={booking} isReady={isSignedIn === true} prefillEmail={user?.email ?? ""} />
    </PaymentShell>
  );
}
