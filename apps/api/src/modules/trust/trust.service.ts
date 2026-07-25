import type { TrustScoreBreakdown } from "@zeyla/shared";
import { computeTrustScore } from "@zeyla/shared";
import type { PoolClient } from "pg";
import { pool, query } from "../../db/client.js";
import { ApiError } from "../marketplace/lib/errors.js";

export interface TrustInputs {
  providerId: string;
  providerName: string | null;
  currentScore: number;
  completedContracts: number;
  avgRating: number | null;
  reviewCount: number;
  flagsReceived: number;
  kycSubmitted: boolean;
  firecrawlMatched: boolean;
}

export interface TrustRecomputeResult {
  providerId: string;
  previousScore: number;
  trustScore: number;
  delta: number;
  changed: boolean;
  reason: string;
  breakdown: TrustScoreBreakdown;
  inputs: TrustInputs;
}

/**
 * Everything the formula needs, in one read.
 *
 * `kyc_submitted` is the one judgement call in here: the formula says
 * "kyc_submitted", the users table only records a kyc_status, so submitted
 * means verified/in review, or pending with both documents uploaded. A rejected
 * KYC earns nothing. Auth owns that table — if the definition should differ,
 * this expression is the only place to change.
 */
const INPUTS_SQL = `
  SELECT
    p.user_id AS provider_id,
    u.name AS provider_name,
    p.trust_score AS current_score,
    p.firecrawl_profile_match,
    (SELECT COUNT(*) FROM contracts c
      WHERE c.provider_id = p.user_id AND c.status = 'completed') AS completed_contracts,
    (SELECT AVG(rating) FROM reviews r WHERE r.provider_id = p.user_id) AS avg_rating,
    (SELECT COUNT(*) FROM reviews r WHERE r.provider_id = p.user_id) AS review_count,
    (SELECT COUNT(*) FROM flags f
      WHERE f.target_provider_id = p.user_id AND f.status <> 'dismissed') AS flags_received,
    (
      u.kyc_status IN ('verified', 'manual_review')
      OR (u.kyc_status = 'pending' AND u.id_doc_url IS NOT NULL AND u.selfie_url IS NOT NULL)
    ) AS kyc_submitted
  FROM providers p
  JOIN users u ON u.id = p.user_id
  WHERE p.user_id = $1::uuid`;

interface InputsRow {
  provider_id: string;
  provider_name: string | null;
  current_score: string;
  firecrawl_profile_match: boolean;
  completed_contracts: string;
  avg_rating: string | null;
  review_count: string;
  flags_received: string;
  kyc_submitted: boolean;
}

function toInputs(row: InputsRow): TrustInputs {
  return {
    providerId: row.provider_id,
    providerName: row.provider_name,
    currentScore: Number(row.current_score),
    completedContracts: Number(row.completed_contracts),
    avgRating: row.avg_rating === null ? null : Number(row.avg_rating),
    reviewCount: Number(row.review_count),
    flagsReceived: Number(row.flags_received),
    kycSubmitted: row.kyc_submitted,
    firecrawlMatched: row.firecrawl_profile_match,
  };
}

export function scoreFromInputs(inputs: TrustInputs): TrustScoreBreakdown {
  return computeTrustScore({
    completedContracts: inputs.completedContracts,
    avgRating: inputs.avgRating,
    // The shared helper calls this kycVerified; the formula counts a submitted
    // KYC, which is what the SQL above resolves.
    kycVerified: inputs.kycSubmitted,
    firecrawlMatched: inputs.firecrawlMatched,
    flagsReceived: inputs.flagsReceived,
  });
}

export async function getTrustInputs(providerId: string): Promise<TrustInputs> {
  const result = await query<InputsRow>(INPUTS_SQL, [providerId]);
  const row = result.rows[0];
  if (!row) throw ApiError.notFound("provider");
  return toInputs(row);
}

/**
 * Recompute from source data and persist.
 *
 * Always derived, never incremental: the score is a pure function of completed
 * contracts, reviews, flags, KYC and the Firecrawl match, so a missed call or a
 * double call can never drift it. The provider row is locked for the duration
 * so two writes landing together (a review and a flag, say) cannot interleave
 * and log the wrong delta.
 */
export async function recomputeTrustScore(
  providerId: string,
  reason: string,
  existingClient?: PoolClient,
): Promise<TrustRecomputeResult> {
  const client = existingClient ?? (await pool.connect());
  const ownsTransaction = !existingClient;

  try {
    if (ownsTransaction) await client.query("BEGIN");

    const locked = await client.query<InputsRow>(
      `${INPUTS_SQL} FOR UPDATE OF p`,
      [providerId],
    );
    const row = locked.rows[0];
    if (!row) throw ApiError.notFound("provider");

    const inputs = toInputs(row);
    const breakdown = scoreFromInputs(inputs);
    const previousScore = inputs.currentScore;
    const delta = Math.round((breakdown.total - previousScore) * 100) / 100;
    const changed = delta !== 0;

    if (changed) {
      await client.query(
        `UPDATE providers SET trust_score = $2::numeric WHERE user_id = $1::uuid`,
        [providerId, breakdown.total],
      );
      await client.query(
        `INSERT INTO trust_score_log
           (provider_id, delta, reason, previous_score, new_score, breakdown)
         VALUES ($1::uuid, $2::numeric, $3, $4::numeric, $5::numeric, $6::jsonb)`,
        [
          providerId,
          delta,
          reason,
          previousScore,
          breakdown.total,
          JSON.stringify({ ...breakdown, inputs }),
        ],
      );
    }

    if (ownsTransaction) await client.query("COMMIT");

    return {
      providerId,
      previousScore,
      trustScore: breakdown.total,
      delta,
      changed,
      reason,
      breakdown,
      inputs,
    };
  } catch (err) {
    if (ownsTransaction) await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (ownsTransaction) client.release();
  }
}

export interface TrustLogEntry {
  id: string;
  delta: number;
  reason: string;
  previousScore: number | null;
  newScore: number | null;
  createdAt: string;
}

export async function getTrustHistory(
  providerId: string,
  limit = 20,
): Promise<TrustLogEntry[]> {
  const result = await query<{
    id: string;
    delta: string;
    reason: string;
    previous_score: string | null;
    new_score: string | null;
    created_at: Date;
  }>(
    `SELECT id, delta, reason, previous_score, new_score, created_at
       FROM trust_score_log
      WHERE provider_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT $2::int`,
    [providerId, limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    delta: Number(row.delta),
    reason: row.reason,
    previousScore: row.previous_score === null ? null : Number(row.previous_score),
    newScore: row.new_score === null ? null : Number(row.new_score),
    createdAt: row.created_at.toISOString(),
  }));
}
