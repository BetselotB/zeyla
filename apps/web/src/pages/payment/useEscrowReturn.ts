import { useEffect, useState } from "react";
import { getContract } from "./api";

export type EscrowReturnState = "checking" | "escrowed" | "unpaid" | "disputed" | "error";

const POLL_ATTEMPTS = 4;
const POLL_DELAY_MS = 1500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolves what actually happened after Chapa redirects back. The return_url
 * is not proof of payment — the browser can arrive before the webhook lands,
 * or a user can navigate here by hand — so this polls GET /contracts/:id a
 * few times instead of trusting the redirect, and treats a contract still
 * stuck in "awaiting_escrow" as unpaid.
 *
 * See docs/api/identity-money.md.
 */
export interface EscrowReturn {
  state: EscrowReturnState;
  /**
   * Where to send the customer next, built from the contract rather than from
   * the URL they came back on — Chapa's redirect carries no request id.
   */
  trackingHref: string;
}

export function useEscrowReturn(contractId: string): EscrowReturn {
  const [state, setState] = useState<EscrowReturnState>("checking");
  const [trackingHref, setTrackingHref] = useState("/tracking");

  useEffect(() => {
    let isCancelled = false;

    async function poll() {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await wait(POLL_DELAY_MS);
        if (isCancelled) return;

        try {
          const contract = await getContract(contractId);
          if (isCancelled) return;

          if (contract.requestId) {
            setTrackingHref(
              `/tracking?requestId=${contract.requestId}&providerId=${contract.providerId}`,
            );
          }

          if (contract.status === "escrowed" || contract.status === "active" || contract.status === "completed") {
            setState("escrowed");
            return;
          }
          if (contract.status === "disputed") {
            setState("disputed");
            return;
          }
          // Still "awaiting_escrow" — keep polling until attempts run out.
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

  return { state, trackingHref };
}
