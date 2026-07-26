import crypto from "node:crypto";
import type {
  Contract,
  ContractEvent,
  ContractStatus,
  EscrowLedgerEntry,
  EscrowStatus,
} from "@zeyla/shared";
import { pool, query } from "../../db/client.js";

/**
 * All contract / escrow_ledger persistence. Nothing else in the codebase
 * writes these tables.
 */

interface ContractRow {
  id: string;
  request_id: string | null;
  user_id: string;
  provider_id: string;
  title: string | null;
  agreed_amount: string;
  currency: string;
  status: ContractStatus;
  created_at: Date;
  status_updated_at: Date;
  completed_at: Date | null;
}

interface LedgerRow {
  id: string;
  contract_id: string;
  amount: string;
  currency: string;
  platform_fee: string;
  provider_payout: string | null;
  status: EscrowStatus;
  chapa_tx_ref: string | null;
  chapa_transfer_ref: string | null;
  checkout_url: string | null;
  created_at: Date;
  held_at: Date | null;
  released_at: Date | null;
  refunded_at: Date | null;
}

const CONTRACT_COLUMNS = `
  id, request_id, user_id, provider_id, title, agreed_amount, currency,
  status, created_at, status_updated_at, completed_at
`;

const LEDGER_COLUMNS = `
  id, contract_id, amount, currency, platform_fee, provider_payout, status,
  chapa_tx_ref, chapa_transfer_ref, checkout_url, created_at, held_at,
  released_at, refunded_at
`;

function toLedger(row: LedgerRow): EscrowLedgerEntry {
  return {
    id: row.id,
    contractId: row.contract_id,
    amount: Number(row.amount),
    currency: row.currency,
    platformFee: Number(row.platform_fee),
    providerPayout: row.provider_payout === null ? null : Number(row.provider_payout),
    status: row.status,
    chapaTxRef: row.chapa_tx_ref,
    chapaTransferRef: row.chapa_transfer_ref,
    checkoutUrl: row.checkout_url,
    createdAt: row.created_at.toISOString(),
    heldAt: row.held_at?.toISOString() ?? null,
    releasedAt: row.released_at?.toISOString() ?? null,
    refundedAt: row.refunded_at?.toISOString() ?? null,
  };
}

function toContract(row: ContractRow, ledger: EscrowLedgerEntry | null): Contract {
  return {
    id: row.id,
    requestId: row.request_id,
    userId: row.user_id,
    providerId: row.provider_id,
    title: row.title,
    agreedAmount: Number(row.agreed_amount),
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    statusUpdatedAt: row.status_updated_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    ledger,
  };
}

export async function providerExists(providerId: string): Promise<boolean> {
  const { rowCount } = await query(
    `SELECT 1 FROM providers WHERE user_id = $1`,
    [providerId],
  );
  return (rowCount ?? 0) > 0;
}

export async function createContract(input: {
  userId: string;
  providerId: string;
  requestId: string | null;
  title: string | null;
  agreedAmount: number;
  currency: string;
}): Promise<Contract> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<ContractRow>(
      `INSERT INTO contracts
         (user_id, provider_id, request_id, title, agreed_amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'awaiting_escrow')
       RETURNING ${CONTRACT_COLUMNS}`,
      [
        input.userId,
        input.providerId,
        input.requestId,
        input.title,
        input.agreedAmount,
        input.currency,
      ],
    );

    const row = rows[0];
    if (!row) throw new Error("failed_to_create_contract");

    await client.query(
      `INSERT INTO contract_events (contract_id, from_status, to_status, actor, reason)
       VALUES ($1, NULL, 'awaiting_escrow', $2, 'contract created')`,
      [row.id, `user:${input.userId}`],
    );

    await client.query("COMMIT");
    return toContract(row, null);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function findContract(id: string): Promise<Contract | null> {
  const { rows } = await query<ContractRow>(
    `SELECT ${CONTRACT_COLUMNS} FROM contracts WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return toContract(row, await findLedgerByContract(id));
}

export async function listContractsForParty(
  userId: string,
): Promise<Contract[]> {
  const { rows } = await query<ContractRow>(
    `SELECT ${CONTRACT_COLUMNS}
       FROM contracts
      WHERE user_id = $1 OR provider_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [userId],
  );

  return Promise.all(
    rows.map(async (row) => toContract(row, await findLedgerByContract(row.id))),
  );
}

/**
 * The contract covering a service request, for a caller who is a party to it.
 *
 * Scoped to the caller in SQL rather than fetched and checked afterwards, so a
 * stranger guessing a request id gets "no contract" instead of a 403 that
 * confirms one exists. Newest wins: re-booking a request after a refund leaves
 * the older contract behind.
 */
export async function findContractByRequest(input: {
  requestId: string;
  partyId: string;
}): Promise<Contract | null> {
  const { rows } = await query<ContractRow>(
    `SELECT ${CONTRACT_COLUMNS}
       FROM contracts
      WHERE request_id = $1
        AND (user_id = $2 OR provider_id = $2)
      ORDER BY created_at DESC
      LIMIT 1`,
    [input.requestId, input.partyId],
  );
  const row = rows[0];
  if (!row) return null;
  return toContract(row, await findLedgerByContract(row.id));
}

/**
 * The newest contract per request, for a caller who is a party to it.
 *
 * Batched so the provider's inbox costs one round trip for the contracts
 * rather than one per job.
 */
export async function listContractsForRequests(input: {
  requestIds: string[];
  partyId: string;
}): Promise<Contract[]> {
  if (input.requestIds.length === 0) return [];

  const { rows } = await query<ContractRow>(
    `SELECT DISTINCT ON (request_id) ${CONTRACT_COLUMNS}
       FROM contracts
      WHERE request_id = ANY($1::uuid[])
        AND (user_id = $2 OR provider_id = $2)
      ORDER BY request_id, created_at DESC`,
    [input.requestIds, input.partyId],
  );

  return Promise.all(
    rows.map(async (row) => toContract(row, await findLedgerByContract(row.id))),
  );
}

/**
 * Compare-and-set on `status`. Returns null when the contract already moved on,
 * which is how concurrent webhook retries and double-clicks are made safe.
 */
export async function transitionContract(input: {
  contractId: string;
  from: ContractStatus;
  to: ContractStatus;
  actor: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<Contract | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<ContractRow>(
      `UPDATE contracts
          SET status = $3::contract_status,
              status_updated_at = now(),
              completed_at = CASE WHEN $3 = 'completed' THEN now() ELSE completed_at END
        WHERE id = $1 AND status = $2::contract_status
        RETURNING ${CONTRACT_COLUMNS}`,
      [input.contractId, input.from, input.to],
    );

    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `INSERT INTO contract_events
         (contract_id, from_status, to_status, actor, reason, metadata)
       VALUES ($1, $2::contract_status, $3::contract_status, $4, $5, $6::jsonb)`,
      [
        input.contractId,
        input.from,
        input.to,
        input.actor,
        input.reason ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    await client.query("COMMIT");
    return toContract(row, await findLedgerByContract(input.contractId));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Writes an audit line without moving the contract — e.g. a failed payout. */
export async function recordContractEvent(input: {
  contractId: string;
  status: ContractStatus;
  actor: string;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO contract_events
       (contract_id, from_status, to_status, actor, reason, metadata)
     VALUES ($1, $2::contract_status, $2::contract_status, $3, $4, $5::jsonb)`,
    [
      input.contractId,
      input.status,
      input.actor,
      input.reason,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function listContractEvents(
  contractId: string,
): Promise<ContractEvent[]> {
  const { rows } = await query<{
    id: string;
    contract_id: string;
    from_status: ContractStatus | null;
    to_status: ContractStatus;
    actor: string;
    reason: string | null;
    created_at: Date;
  }>(
    `SELECT id, contract_id, from_status, to_status, actor, reason, created_at
       FROM contract_events
      WHERE contract_id = $1
      ORDER BY created_at ASC`,
    [contractId],
  );

  return rows.map((row) => ({
    id: row.id,
    contractId: row.contract_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actor: row.actor,
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
  }));
}

// --- Ledger ------------------------------------------------------------------

export async function findLedgerByContract(
  contractId: string,
): Promise<EscrowLedgerEntry | null> {
  const { rows } = await query<LedgerRow>(
    `SELECT ${LEDGER_COLUMNS}
       FROM escrow_ledger
      WHERE contract_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [contractId],
  );
  return rows[0] ? toLedger(rows[0]) : null;
}

export async function findLedgerByTxRef(
  txRef: string,
): Promise<EscrowLedgerEntry | null> {
  const { rows } = await query<LedgerRow>(
    `SELECT ${LEDGER_COLUMNS} FROM escrow_ledger WHERE chapa_tx_ref = $1`,
    [txRef],
  );
  return rows[0] ? toLedger(rows[0]) : null;
}

/**
 * One pending ledger row per contract. Re-funding an unpaid contract reuses
 * the row (new tx_ref) rather than stacking duplicates.
 */
export async function upsertPendingLedger(input: {
  contractId: string;
  amount: number;
  currency: string;
  platformFee: number;
  txRef: string;
  checkoutUrl: string;
}): Promise<EscrowLedgerEntry> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<LedgerRow>(
      `SELECT ${LEDGER_COLUMNS}
         FROM escrow_ledger
        WHERE contract_id = $1 AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [input.contractId],
    );

    const sql = existing.rows[0]
      ? `UPDATE escrow_ledger
            SET amount = $2, currency = $3, platform_fee = $4,
                chapa_tx_ref = $5, checkout_url = $6, updated_at = now()
          WHERE id = $1
          RETURNING ${LEDGER_COLUMNS}`
      : `INSERT INTO escrow_ledger
            (contract_id, amount, currency, platform_fee, chapa_tx_ref, checkout_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING ${LEDGER_COLUMNS}`;

    const key = existing.rows[0] ? existing.rows[0].id : input.contractId;
    const { rows } = await client.query<LedgerRow>(sql, [
      key,
      input.amount,
      input.currency,
      input.platformFee,
      input.txRef,
      input.checkoutUrl,
    ]);

    await client.query("COMMIT");
    const row = rows[0];
    if (!row) throw new Error("failed_to_upsert_ledger");
    return toLedger(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** pending -> held. No-op (returns null) if it is not pending any more. */
export async function markLedgerHeld(
  txRef: string,
): Promise<EscrowLedgerEntry | null> {
  const { rows } = await query<LedgerRow>(
    `UPDATE escrow_ledger
        SET status = 'held', held_at = now(), updated_at = now()
      WHERE chapa_tx_ref = $1 AND status = 'pending'
      RETURNING ${LEDGER_COLUMNS}`,
    [txRef],
  );
  return rows[0] ? toLedger(rows[0]) : null;
}

export async function markLedgerReleased(input: {
  ledgerId: string;
  providerPayout: number;
  transferRef: string | null;
}): Promise<EscrowLedgerEntry | null> {
  const { rows } = await query<LedgerRow>(
    `UPDATE escrow_ledger
        SET status = 'released',
            released_at = now(),
            provider_payout = $2,
            chapa_transfer_ref = $3,
            updated_at = now()
      WHERE id = $1 AND status = 'held'
      RETURNING ${LEDGER_COLUMNS}`,
    [input.ledgerId, input.providerPayout, input.transferRef],
  );
  return rows[0] ? toLedger(rows[0]) : null;
}

export async function markLedgerRefunded(
  ledgerId: string,
): Promise<EscrowLedgerEntry | null> {
  const { rows } = await query<LedgerRow>(
    `UPDATE escrow_ledger
        SET status = 'refunded', refunded_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'held'
      RETURNING ${LEDGER_COLUMNS}`,
    [ledgerId],
  );
  return rows[0] ? toLedger(rows[0]) : null;
}

// --- Webhook idempotency -----------------------------------------------------

/**
 * Records a delivery keyed by a hash of the exact bytes Chapa sent.
 * Returns false when we have seen this body before, so retries are ignored.
 */
export async function recordWebhookEvent(input: {
  rawBody: string;
  txRef: string | null;
  eventType: string | null;
  payload: unknown;
}): Promise<boolean> {
  const payloadHash = crypto
    .createHash("sha256")
    .update(input.rawBody)
    .digest("hex");

  const { rowCount } = await query(
    `INSERT INTO chapa_webhook_events (payload_hash, tx_ref, event_type, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (payload_hash) DO NOTHING`,
    [payloadHash, input.txRef, input.eventType, JSON.stringify(input.payload)],
  );

  return (rowCount ?? 0) > 0;
}
