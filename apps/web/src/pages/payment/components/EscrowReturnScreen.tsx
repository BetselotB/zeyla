import { useEffect, useState } from "react";
import { verifyEscrowPayment } from "../api";
import type { ContractStatus } from "../types";

type EscrowReturnScreenProps = {
  txRef: string;
};

type VerifyState = "checking" | "success" | "failure";

const FAILURE_STATUSES: ContractStatus[] = ["failed", "disputed"];

/**
 * Handles Chapa's return_url. Reads tx_ref (already parsed by the parent from
 * the query string), asks our backend to verify the transaction server-side,
 * and shows a definitive success/failure state — never assumes success just
 * because the user was redirected back.
 */
export function EscrowReturnScreen({ txRef }: EscrowReturnScreenProps) {
  const [state, setState] = useState<VerifyState>("checking");

  useEffect(() => {
    let isCancelled = false;
    verifyEscrowPayment(txRef)
      .then((result) => {
        if (isCancelled) return;
        setState(FAILURE_STATUSES.includes(result.status) ? "failure" : "success");
      })
      .catch(() => {
        if (!isCancelled) setState("failure");
      });
    return () => {
      isCancelled = true;
    };
  }, [txRef]);

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

  if (state === "failure") {
    return (
      <div className="payment__form">
        <div className="payment__status">
          <span className="payment__status-icon payment__status-icon--warn">!</span>
          <div>
            <strong>We couldn't confirm this payment</strong>
            <p>Please try again. If you were charged, contact support before retrying.</p>
          </div>
        </div>
        <button className="payment__button" type="button" onClick={() => window.location.assign(window.location.pathname)}>
          Try again
        </button>
      </div>
    );
  }

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
