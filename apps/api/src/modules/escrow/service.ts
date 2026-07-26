import type {
  Contract,
  ContractStatus,
  EscrowLedgerEntry,
  FundContractResponse,
  JobPaymentSummary,
  RequestContractResponse,
} from "@zeyla/shared";
import { toJobPaymentSummary } from "@zeyla/shared";
import { env } from "../../config/env.js";
import type { UserRow } from "../auth/repo.js";
import {
  initializeTransaction,
  isChapaLive,
  newTxRef,
  transferToProvider,
  verifyTransaction,
} from "./chapa.js";
import { publishContractEvent } from "./events.js";
import * as repo from "./repo.js";
import { assertTransition } from "./state-machine.js";
import { verifyChapaSignature } from "./signature.js";

export class EscrowError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * With no CHAPA_WEBHOOK_SECRET configured, demo mode falls back to a fixed
 * development secret. The simulated checkout signs with the same value, so the
 * demo still runs through real HMAC verification instead of skipping it.
 */
export function webhookSecret(): string {
  if (env.CHAPA_WEBHOOK_SECRET) return env.CHAPA_WEBHOOK_SECRET;
  if (env.DEMO_MODE) return "zeyla-demo-webhook-secret";
  return "";
}

function platformFeeFor(amount: number): number {
  return Math.round(amount * env.PLATFORM_FEE_PERCENT) / 100;
}

function assertParticipant(contract: Contract, userId: string): void {
  if (contract.userId !== userId && contract.providerId !== userId) {
    throw new EscrowError("not_a_party_to_this_contract", 403);
  }
}

async function loadContract(id: string): Promise<Contract> {
  const contract = await repo.findContract(id);
  if (!contract) throw new EscrowError("contract_not_found", 404);
  return contract;
}

/**
 * Runs a guarded transition. The compare-and-set in the repo means only one
 * concurrent caller can win, so double-clicks and webhook retries collapse
 * into a single move.
 */
async function move(
  contract: Contract,
  to: ContractStatus,
  actor: string,
  reason?: string,
  metadata?: Record<string, unknown>,
): Promise<Contract> {
  assertTransition(contract.status, to);

  const updated = await repo.transitionContract({
    contractId: contract.id,
    from: contract.status,
    to,
    actor,
    reason,
    metadata,
  });

  if (!updated) throw new EscrowError("contract_changed_concurrently", 409);

  await publishContractEvent(updated, contract.status);
  return updated;
}

// --- Contract lifecycle -------------------------------------------------------

export async function createContract(
  user: UserRow,
  body: Record<string, unknown>,
): Promise<Contract> {
  const providerId = typeof body.providerId === "string" ? body.providerId : "";
  if (!providerId) throw new EscrowError("provider_id_required");

  const agreedAmount = Number(body.agreedAmount);
  if (!Number.isFinite(agreedAmount) || agreedAmount <= 0) {
    throw new EscrowError("agreed_amount_must_be_positive");
  }
  if (providerId === user.id) {
    throw new EscrowError("cannot_contract_with_yourself");
  }
  if (!(await repo.providerExists(providerId))) {
    throw new EscrowError("provider_not_found", 404);
  }

  return repo.createContract({
    userId: user.id,
    providerId,
    requestId: typeof body.requestId === "string" ? body.requestId : null,
    title: typeof body.title === "string" ? body.title : null,
    agreedAmount: Math.round(agreedAmount * 100) / 100,
    currency: typeof body.currency === "string" ? body.currency : "ETB",
  });
}

export async function getContract(
  contractId: string,
  user: UserRow,
): Promise<Contract> {
  const contract = await loadContract(contractId);
  assertParticipant(contract, user.id);
  return contract;
}

export async function listContracts(user: UserRow): Promise<Contract[]> {
  return repo.listContractsForParty(user.id);
}

/**
 * "Has this job been paid for?" — the question both the customer's tracking
 * screen and the provider's job view ask.
 *
 * Answers with null rather than 404 when there is no contract yet: not having
 * started checkout is a normal state for an accepted request, not an error.
 */
export async function getContractForRequest(
  requestId: string,
  user: UserRow,
): Promise<RequestContractResponse> {
  const contract = await repo.findContractByRequest({
    requestId,
    partyId: user.id,
  });

  return {
    contract,
    payment: contract ? toJobPaymentSummary(contract) : null,
  };
}

/**
 * Exit path for an accepted request, for whichever party is walking away. An
 * unfunded request may not have a contract yet; once checkout exists, park the
 * contract in dispute so a late Chapa payment can never progress into active
 * work or payout silently.
 *
 * Dispute rather than delete, because held money has to stay accounted for:
 * the admin refund path is what actually returns it.
 */
export async function disputeContractForCancellation(
  requestId: string,
  partyId: string,
  reason: string,
): Promise<Contract | null> {
  const contract = await repo.findContractByRequest({ requestId, partyId });
  if (!contract) return null;
  if (contract.status === "disputed") return contract;
  if (contract.status === "completed") {
    throw new EscrowError("completed_job_cannot_be_cancelled", 409);
  }
  return move(contract, "disputed", `user:${partyId}`, reason);
}

export function disputeContractForProviderCancellation(
  requestId: string,
  providerId: string,
): Promise<Contract | null> {
  return disputeContractForCancellation(
    requestId,
    providerId,
    "provider cancelled the job",
  );
}

export async function getContractEvents(contractId: string, user: UserRow) {
  const contract = await loadContract(contractId);
  assertParticipant(contract, user.id);
  return repo.listContractEvents(contractId);
}

/**
 * Payment state for many requests at once, keyed by request id.
 *
 * Exported for the marketplace module's provider inbox, so a provider sees
 * "customer has paid" on the job card without this module having to know what
 * a ping is, and without marketplace reaching into the escrow tables itself.
 * Requests with no contract are simply absent from the map.
 */
export async function paymentSummariesByRequest(input: {
  requestIds: string[];
  partyId: string;
}): Promise<Map<string, JobPaymentSummary>> {
  const contracts = await repo.listContractsForRequests(input);
  const byRequest = new Map<string, JobPaymentSummary>();

  for (const contract of contracts) {
    if (contract.requestId) {
      byRequest.set(contract.requestId, toJobPaymentSummary(contract));
    }
  }
  return byRequest;
}

/** Step 1 of funding: ask Chapa for a checkout URL and park a pending ledger row. */
export async function fundContract(
  contractId: string,
  user: UserRow,
  options: { returnUrl?: string; email?: string } = {},
): Promise<FundContractResponse> {
  const contract = await loadContract(contractId);

  if (contract.userId !== user.id) {
    throw new EscrowError("only_the_payer_can_fund", 403);
  }
  if (contract.status !== "awaiting_escrow") {
    throw new EscrowError(`cannot_fund_contract_in_status_${contract.status}`, 409);
  }

  const txRef = newTxRef(contract.id);
  const returnUrl =
    options.returnUrl ?? `${env.WEB_APP_URL}/payment/return?contract=${contract.id}`;

  // Chapa requires a receipt email and validates the domain's MX records, so a
  // synthesised address on a domain we do not own is rejected outright.
  const email = options.email ?? user.email ?? env.CHAPA_FALLBACK_EMAIL;
  if (!email) {
    throw new EscrowError("email_required_for_checkout", 400);
  }

  const { checkoutUrl, simulated } = await initializeTransaction({
    amount: contract.agreedAmount,
    currency: contract.currency,
    txRef,
    email,
    firstName: user.name?.split(" ")[0] ?? "Zeyla",
    lastName: user.name?.split(" ").slice(1).join(" ") || "Customer",
    phone: user.phone ?? undefined,
    callbackUrl: `${env.PUBLIC_API_URL}/api/escrow/webhooks/chapa`,
    returnUrl,
    title: contract.title ?? undefined,
  });

  await repo.upsertPendingLedger({
    contractId: contract.id,
    amount: contract.agreedAmount,
    currency: contract.currency,
    platformFee: platformFeeFor(contract.agreedAmount),
    txRef,
    checkoutUrl,
  });

  return {
    contractId: contract.id,
    txRef,
    amount: contract.agreedAmount,
    currency: contract.currency,
    checkoutUrl,
    simulated,
  };
}

export interface WebhookOutcome {
  accepted: boolean;
  reason: string;
  contractId?: string;
  status?: ContractStatus;
}

/**
 * Step 2 of funding: Chapa tells us the money landed.
 *
 * Nothing in the payload is trusted until the HMAC over the raw bytes checks
 * out, and in live mode the transaction is independently re-verified against
 * Chapa before the ledger moves to `held`.
 */
export async function handleChapaWebhook(input: {
  rawBody: string;
  chapaSignature?: string;
  xChapaSignature?: string;
}): Promise<WebhookOutcome> {
  const signature = verifyChapaSignature({
    rawBody: input.rawBody,
    secret: webhookSecret(),
    headers: {
      chapaSignature: input.chapaSignature,
      xChapaSignature: input.xChapaSignature,
    },
  });

  if (!signature.valid) {
    throw new EscrowError(
      `webhook_signature_${signature.reason}`,
      signature.reason === "no_secret_configured" ? 503 : 401,
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    throw new EscrowError("webhook_body_not_json", 400);
  }

  const nested = (payload.data ?? {}) as Record<string, unknown>;
  const txRef =
    (typeof payload.tx_ref === "string" && payload.tx_ref) ||
    (typeof nested.tx_ref === "string" && nested.tx_ref) ||
    (typeof payload.reference === "string" && payload.reference) ||
    null;
  const eventType =
    (typeof payload.event === "string" && payload.event) ||
    (typeof payload.status === "string" && payload.status) ||
    null;

  const isFirstDelivery = await repo.recordWebhookEvent({
    rawBody: input.rawBody,
    txRef,
    eventType,
    payload,
  });
  if (!isFirstDelivery) {
    return { accepted: false, reason: "duplicate_delivery" };
  }
  if (!txRef) {
    return { accepted: false, reason: "missing_tx_ref" };
  }

  const ledger = await repo.findLedgerByTxRef(txRef);
  if (!ledger) {
    return { accepted: false, reason: "unknown_tx_ref" };
  }
  if (ledger.status !== "pending") {
    return { accepted: false, reason: `ledger_already_${ledger.status}` };
  }

  if (isChapaLive()) {
    const verified = await verifyTransaction(txRef);
    if (!verified.paid) {
      return { accepted: false, reason: "chapa_reports_unpaid" };
    }
    if (verified.amount !== null && Math.abs(verified.amount - ledger.amount) > 0.01) {
      throw new EscrowError("webhook_amount_mismatch", 409);
    }
  }

  const held = await repo.markLedgerHeld(txRef);
  if (!held) {
    return { accepted: false, reason: "ledger_race_lost" };
  }

  const contract = await loadContract(ledger.contractId);
  const updated = await move(contract, "escrowed", "chapa:webhook", "funds held in escrow", {
    txRef,
    signatureMatched: signature.matched,
  });

  return {
    accepted: true,
    reason: "funds_held",
    contractId: updated.id,
    status: updated.status,
  };
}

export async function startWork(
  contractId: string,
  user: UserRow,
  reason?: string,
): Promise<Contract> {
  const contract = await loadContract(contractId);
  assertParticipant(contract, user.id);
  return move(contract, "active", `user:${user.id}`, reason ?? "work started");
}

/**
 * Completion pays the provider out. The state transition happens first: its
 * compare-and-set is what guarantees a contract can only be paid out once,
 * even if two "complete" requests arrive together. If the transfer then fails,
 * the contract is completed with funds still held and
 * `/admin/contracts/:id/retry-payout` finishes the job.
 */
export async function completeContract(
  contractId: string,
  user: UserRow,
  reason?: string,
): Promise<{ contract: Contract; ledger: EscrowLedgerEntry | null; payoutError?: string }> {
  const contract = await loadContract(contractId);
  if (contract.userId !== user.id) {
    throw new EscrowError("only_the_payer_can_complete", 403);
  }

  const completed = await move(
    contract,
    "completed",
    `user:${user.id}`,
    reason ?? "work confirmed complete",
  );

  return payout(completed, `user:${user.id}`);
}

export async function disputeContract(
  contractId: string,
  user: UserRow,
  reason?: string,
): Promise<Contract> {
  const contract = await loadContract(contractId);
  assertParticipant(contract, user.id);
  return move(contract, "disputed", `user:${user.id}`, reason ?? "disputed by party");
}

// --- Admin -------------------------------------------------------------------

/** Manual dispute resolution — the stand-in for a full dispute workflow. */
export async function adminForceRelease(
  contractId: string,
  reason?: string,
): Promise<{ contract: Contract; ledger: EscrowLedgerEntry | null; payoutError?: string }> {
  const contract = await loadContract(contractId);
  const completed = await move(
    contract,
    "completed",
    "admin",
    reason ?? "admin force-release",
  );
  return payout(completed, "admin");
}

export async function adminRetryPayout(
  contractId: string,
): Promise<{ contract: Contract; ledger: EscrowLedgerEntry | null; payoutError?: string }> {
  const contract = await loadContract(contractId);
  if (contract.status !== "completed") {
    throw new EscrowError("contract_not_completed", 409);
  }
  return payout(contract, "admin:retry");
}

export async function adminRefund(
  contractId: string,
  reason?: string,
): Promise<{ contract: Contract; ledger: EscrowLedgerEntry | null }> {
  const contract = await loadContract(contractId);
  const ledger = await repo.findLedgerByContract(contractId);

  if (!ledger || ledger.status !== "held") {
    throw new EscrowError("no_held_funds_to_refund", 409);
  }

  const refunded = await repo.markLedgerRefunded(ledger.id);
  const disputed =
    contract.status === "disputed"
      ? contract
      : await move(contract, "disputed", "admin", reason ?? "refunded to payer");

  return { contract: disputed, ledger: refunded };
}

/**
 * Moves held funds to the provider, minus the platform fee. Safe to call more
 * than once: `markLedgerReleased` only fires while the row is still `held`.
 */
async function payout(
  contract: Contract,
  actor: string,
): Promise<{ contract: Contract; ledger: EscrowLedgerEntry | null; payoutError?: string }> {
  const ledger = await repo.findLedgerByContract(contract.id);
  if (!ledger || ledger.status !== "held") {
    return { contract, ledger };
  }

  const providerPayout = Math.round((ledger.amount - ledger.platformFee) * 100) / 100;

  try {
    const transfer = await transferToProvider({
      amount: providerPayout,
      currency: ledger.currency,
      reference: `payout-${ledger.id}`,
    });

    const released = await repo.markLedgerReleased({
      ledgerId: ledger.id,
      providerPayout,
      transferRef: transfer.transferRef,
    });

    // Re-read so the contract's embedded ledger reflects the payout too,
    // rather than the snapshot taken before the transfer.
    return {
      contract: (await repo.findContract(contract.id)) ?? contract,
      ledger: released ?? ledger,
    };
  } catch (err) {
    const payoutError = err instanceof Error ? err.message : "payout_failed";
    console.error(`[escrow] payout failed for contract ${contract.id}:`, payoutError);

    await repo.recordContractEvent({
      contractId: contract.id,
      status: contract.status,
      actor,
      reason: `payout failed: ${payoutError}`,
      metadata: { ledgerId: ledger.id },
    });

    return { contract, ledger, payoutError };
  }
}
