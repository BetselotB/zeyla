import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Contract,
  ContractEventMessage,
  JobPaymentSummary,
} from "@zeyla/shared";
import { REALTIME_EVENTS } from "@zeyla/shared";
import { useSocketEvent } from "../realtime";
import { completeContract, getContractForRequest, startWork } from "./api";

/**
 * Backstop for a socket that dropped without saying so. Only runs while the
 * job is still waiting on money, so a paid job costs nothing to sit on.
 */
const POLL_MS = 4000;

export interface JobPaymentState {
  payment: JobPaymentSummary | null;
  contract: Contract | null;
  isLoading: boolean;
  /** True while a lifecycle move is in flight, for disabling its button. */
  isBusy: boolean;
  error: string | null;
  refresh: () => void;
  /** `escrowed` -> `active`. Either party. */
  start: () => void;
  /** `active` -> `completed`, releasing the escrow. Payer only. */
  complete: () => void;
}

/**
 * The payment state of one job, kept live for whichever party is looking.
 *
 * The authoritative moment is Chapa's webhook, which lands on the server and
 * is announced on the socket — never the browser redirect back from checkout,
 * which proves only that the customer closed the Chapa tab. So this listens
 * for the contract transition and re-reads from the API rather than trusting
 * anything the payload or the URL claims.
 */
export function useJobPayment(requestId: string | null): JobPaymentState {
  const [state, setState] = useState<{
    payment: JobPaymentSummary | null;
    contract: Contract | null;
    isLoading: boolean;
    error: string | null;
  }>({ payment: null, contract: null, isLoading: Boolean(requestId), error: null });

  // Read inside callbacks that must not be rebuilt when the contract changes.
  const contractId = state.contract?.id ?? null;
  const contractIdRef = useRef<string | null>(null);
  contractIdRef.current = contractId;

  const load = useCallback(async () => {
    if (!requestId) return;
    try {
      const { contract, payment } = await getContractForRequest(requestId);
      setState({ contract, payment, isLoading: false, error: null });
    } catch (err) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: err instanceof Error ? err.message : "payment_lookup_failed",
      }));
    }
  }, [requestId]);

  useEffect(() => {
    if (!requestId) {
      setState({ payment: null, contract: null, isLoading: false, error: null });
      return;
    }
    setState((current) => ({ ...current, isLoading: true }));
    void load();
  }, [requestId, load]);

  // The server puts every socket in its own user room and publishes contract
  // transitions there, so both the payer and the provider are reached without
  // either having to subscribe to anything.
  useSocketEvent<ContractEventMessage>(
    REALTIME_EVENTS.CONTRACT_STATUS,
    useCallback(
      (event) => {
        // Before checkout there is no id to match on, and the first contract
        // for this request is exactly the event worth catching.
        const isOurs =
          contractIdRef.current === null || event.contractId === contractIdRef.current;
        if (isOurs) void load();
      },
      [load],
    ),
  );

  const isSettled = state.payment?.isPaid === true;

  useEffect(() => {
    if (!requestId || isSettled) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [requestId, isSettled, load]);

  // --- Lifecycle moves -------------------------------------------------------

  const [isBusy, setIsBusy] = useState(false);

  const run = useCallback(
    async (move: (contractId: string) => Promise<unknown>) => {
      const id = contractIdRef.current;
      if (!id || isBusy) return;

      setIsBusy(true);
      try {
        await move(id);
      } catch (err) {
        setState((current) => ({
          ...current,
          error: err instanceof Error ? err.message : "transition_failed",
        }));
      } finally {
        setIsBusy(false);
        // Re-read either way: a rejected move usually means the contract has
        // already moved on, and the fresh state is what the UI should show.
        await load();
      }
    },
    [isBusy, load],
  );

  return {
    payment: state.payment,
    contract: state.contract,
    isLoading: state.isLoading,
    isBusy,
    error: state.error,
    refresh: useCallback(() => void load(), [load]),
    start: useCallback(() => void run(startWork), [run]),
    complete: useCallback(() => void run(completeContract), [run]),
  };
}
