import type { ContractStatus } from "@zeyla/shared";

/**
 * Contract state machine — the core IP of Zeyla.
 *
 *   awaiting_escrow ──fund+webhook──> escrowed ──start──> active
 *          │                             │                  │
 *          └──────────── dispute ────────┴──── dispute ──────┤
 *                                                            │
 *                                              complete ─────> completed
 *   disputed ──admin force-release──> completed
 *
 * Money rule: funds only move on a transition. `escrowed` means Chapa
 * confirmed a hold; `completed` means the payout was attempted. Nothing else
 * may touch the ledger.
 */
export const TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  awaiting_escrow: ["escrowed", "disputed"],
  escrowed: ["active", "disputed"],
  active: ["completed", "disputed"],
  completed: [],
  disputed: ["completed"], // admin release only
};

/** Statuses from which money is still recoverable by the payer. */
export const REFUNDABLE: ContractStatus[] = ["escrowed", "active", "disputed"];

export class InvalidTransitionError extends Error {
  readonly status = 409;
  constructor(
    readonly from: ContractStatus,
    readonly to: ContractStatus,
  ) {
    super(`invalid_transition_${from}_to_${to}`);
  }
}

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ContractStatus, to: ContractStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
