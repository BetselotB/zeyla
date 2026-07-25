import { useEffect, useState } from "react";
import { getContract } from "../api";

type EscrowReturnScreenProps = {
  contractId: string;
};

type ReturnState = "checking" | "escrowed" | "unpaid" | "disputed" | "error";

const POLL_ATTEMPTS = 4;
const POLL_DELAY_MS = 1500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Handles Chapa's return_url. The return_url itself is not proof of
 * payment — the browser can arrive here before the webhook lands, or a user
 * can navigate here by hand — so this polls GET /contracts/:id a few times
 * rather than trusting the redirect. See docs/api/identity-money.md.
 */
export function EscrowReturnScreen({ contractId }: EscrowReturnScreenProps) {
  const [state, setState] = useState<ReturnState>("checking");

  useEffect(() => {
    let isCancelled = false;

    async function poll() {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await wait(POLL_DELAY_MS);
        if (isCancelled) return;
        try {
          const contract = await getContract(contractId);
          if (contract.status === "escrowed" || contract.status === "active" || contract.status === "completed") {
            if (!isCancelled) setState("escrowed");
            return;
          }
          if (contract.status === "disputed") {
            if (!isCancelled) setState("disputed");
            return;
          }
          // Still "awaiting_escrow" — keep polling until we run out of attempts.
        } catch {
          if (!isCancelled) setState("error");
          return;
        }
      }
      if (!isCancelled) setState("unpaid");
    }

    poll();
    return () => {
      isCancelled = true;
    };
  }, [contractId]);

  if (state === "checking") {
    return (
      <div className="payment__form">
        <div className="payment__status">
          <span className="payment__status-icon">i</span>
          <div>
            <strong>Confirming your payment</strong>
            <p>This only takes a moment.</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === "escrowed") {
    return (
      <div className="payment__form">
        <div className="payment__status">
          <span className="payment__status-icon">✓</span>
          <div>
            <strong>Payment held in escrow</strong>
            <p>Your funds are held securely and will be released once the work is complete.</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === "disputed") {
    return (
      <div className="payment__form">
        <div className="payment__status">
          <span className="payment__status-icon payment__status-icon--warn">!</span>
          <div>
            <strong>This booking needs attention</strong>
            <p>Contact support — this contract has been flagged for manual review.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="payment__form">
      <div className="payment__status">
        <span className="payment__status-icon payment__status-icon--warn">!</span>
        <div>
          <strong>We couldn't confirm this payment yet</strong>
          <p>If you completed checkout, this can take a moment to settle. Refresh to check again.</p>
        </div>
      </div>
      <button className="payment__button" type="button" onClick={() => window.location.reload()}>
        Refresh
      </button>
    </div>
  );
}
