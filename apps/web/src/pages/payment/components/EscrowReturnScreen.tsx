import type { EscrowReturnState } from "../useEscrowReturn";

type EscrowReturnScreenProps = {
  state: EscrowReturnState;
  trackingHref: string;
};

/**
 * Outcome badge and action for the return leg of checkout. The heading and
 * supporting copy live in the page hero (PaymentPage) so there's one source of
 * truth per state; this only renders the badge and whatever the user can do
 * next. Polling lives in useEscrowReturn.
 */
export function EscrowReturnScreen({ state, trackingHref }: EscrowReturnScreenProps) {
  if (state === "checking") {
    return (
      <div className="payment__form">
        <div className="payment__status">
          <span className="payment__status-icon payment__status-icon--pending">•••</span>
        </div>
      </div>
    );
  }

  if (state === "escrowed") {
    return (
      <div className="payment__form">
        <div className="payment__status">
          <span className="payment__status-icon">✓</span>
        </div>
        <a className="payment__button" href={trackingHref}>
          Track this job
        </a>
      </div>
    );
  }

  if (state === "disputed") {
    return (
      <div className="payment__form">
        <div className="payment__status">
          <span className="payment__status-icon payment__status-icon--warn">!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="payment__form">
      <div className="payment__status">
        <span className="payment__status-icon payment__status-icon--warn">!</span>
      </div>
      <button className="payment__button" type="button" onClick={() => window.location.reload()}>
        Check again
      </button>
    </div>
  );
}
