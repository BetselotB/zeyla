import type { FlagDto, FlagStatus, ReviewDto } from "@zeyla/shared";
import { pool, query } from "../../db/client.js";
import type { Actor } from "../marketplace/lib/actor.js";
import { ApiError } from "../marketplace/lib/errors.js";
import { notify } from "../notifications/notifications.service.js";
import { recomputeTrustScore, type TrustRecomputeResult } from "./trust.service.js";

interface ReviewRow {
  id: string;
  contract_id: string;
  provider_id: string;
  reviewer_user_id: string | null;
  rating: number;
  comment: string | null;
  voice_url: string | null;
  transcript_source: string | null;
  created_at: Date;
}

const REVIEW_COLUMNS = `
  id, contract_id, provider_id, reviewer_user_id, rating, comment, voice_url,
  transcript_source, created_at`;

function toReviewDto(row: ReviewRow): ReviewDto {
  return {
    id: row.id,
    contractId: row.contract_id,
    providerId: row.provider_id,
    reviewerUserId: row.reviewer_user_id,
    rating: row.rating,
    comment: row.comment,
    voiceUrl: row.voice_url,
    transcriptSource: row.transcript_source,
    createdAt: row.created_at.toISOString(),
  };
}

export interface CreateReviewInput {
  contractId: string;
  rating: number;
  comment?: string | null;
  voiceUrl?: string | null;
  transcriptSource?: string | null;
}

export interface CreateReviewResult {
  review: ReviewDto;
  trust: TrustRecomputeResult;
}

/**
 * Review a finished job.
 *
 * The insert and the trust recompute share one transaction: a review that is
 * visible but not yet counted would show a score that contradicts the reviews
 * printed underneath it.
 */
export async function createReview(
  actor: Actor,
  input: CreateReviewInput,
): Promise<CreateReviewResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const contract = await client.query<{
      id: string;
      user_id: string;
      provider_id: string;
      status: string;
    }>(
      "SELECT id, user_id, provider_id, status FROM contracts WHERE id = $1::uuid",
      [input.contractId],
    );
    const row = contract.rows[0];
    if (!row || row.user_id !== actor.userId) throw ApiError.notFound("contract");
    if (row.status !== "completed") {
      throw ApiError.conflict("contract_not_completed", { status: row.status });
    }

    const existing = await client.query<{ id: string }>(
      "SELECT id FROM reviews WHERE contract_id = $1::uuid",
      [input.contractId],
    );
    if (existing.rows.length > 0) throw ApiError.conflict("review_already_exists");

    const inserted = await client.query<ReviewRow>(
      `INSERT INTO reviews
         (contract_id, provider_id, reviewer_user_id, rating, comment, voice_url, transcript_source)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::int, $5, $6, $7)
       RETURNING ${REVIEW_COLUMNS}`,
      [
        input.contractId,
        row.provider_id,
        actor.userId,
        input.rating,
        input.comment ?? null,
        input.voiceUrl ?? null,
        input.transcriptSource ?? null,
      ],
    );

    const trust = await recomputeTrustScore(
      row.provider_id,
      `review: ${input.rating}-star on contract ${input.contractId.slice(0, 8)}`,
      client,
    );

    await client.query("COMMIT");

    const review = toReviewDto(inserted.rows[0]!);
    await notify({
      userId: row.provider_id,
      type: "review_received",
      title: `You received a ${input.rating}-star review`,
      body: trust.changed
        ? `Your trust score is now ${trust.trustScore}.`
        : input.comment,
      data: { reviewId: review.id, contractId: review.contractId, rating: review.rating },
    });

    return { review, trust };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function listProviderReviews(
  providerId: string,
  limit = 20,
): Promise<ReviewDto[]> {
  const result = await query<ReviewRow>(
    `SELECT ${REVIEW_COLUMNS}
       FROM reviews
      WHERE provider_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT $2::int`,
    [providerId, limit],
  );
  return result.rows.map(toReviewDto);
}

// --- Flags -------------------------------------------------------------------

interface FlagRow {
  id: string;
  target_provider_id: string | null;
  flagged_user_id: string | null;
  reporter_user_id: string | null;
  provider_id: string | null;
  contract_id: string | null;
  reason: string | null;
  status: string;
  created_at: Date;
}

const FLAG_COLUMNS = `
  id, target_provider_id, flagged_user_id, reporter_user_id, provider_id,
  contract_id, reason, status, created_at`;

function toFlagDto(row: FlagRow): FlagDto {
  return {
    id: row.id,
    targetProviderId: row.target_provider_id,
    flaggedUserId: row.flagged_user_id,
    reporterUserId: row.reporter_user_id ?? row.provider_id,
    contractId: row.contract_id,
    reason: row.reason,
    status: row.status as FlagStatus,
    createdAt: row.created_at.toISOString(),
  };
}

export interface CreateFlagInput {
  /** Exactly one of these. */
  providerId?: string;
  userId?: string;
  contractId?: string | null;
  reason: string;
}

export interface CreateFlagResult {
  flag: FlagDto;
  trust: TrustRecomputeResult | null;
}

/**
 * Flag a provider (costs them 5 trust points) or a user (recorded only —
 * users have no score). One flag per reporter per target, so a single angry
 * customer cannot drain a provider's score by tapping the button repeatedly.
 */
export async function createFlag(
  actor: Actor,
  input: CreateFlagInput,
): Promise<CreateFlagResult> {
  if (Boolean(input.providerId) === Boolean(input.userId)) {
    throw ApiError.badRequest("flag_needs_exactly_one_target");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (input.providerId === actor.userId || input.userId === actor.userId) {
      throw ApiError.badRequest("cannot_flag_yourself");
    }

    const duplicate = await client.query<{ id: string }>(
      `SELECT id FROM flags
        WHERE COALESCE(reporter_user_id, provider_id) = $1::uuid
          AND target_provider_id IS NOT DISTINCT FROM $2::uuid
          AND flagged_user_id IS NOT DISTINCT FROM $3::uuid
          AND status <> 'dismissed'`,
      [actor.userId, input.providerId ?? null, input.userId ?? null],
    );
    if (duplicate.rows.length > 0) throw ApiError.conflict("already_flagged");

    const inserted = await client.query<FlagRow>(
      `INSERT INTO flags
         (target_provider_id, flagged_user_id, reporter_user_id, provider_id, contract_id, reason)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6)
       RETURNING ${FLAG_COLUMNS}`,
      [
        input.providerId ?? null,
        input.userId ?? null,
        actor.userId,
        // 001 shaped provider->user flags around provider_id; keep it populated
        // for that direction so the escrow/admin views still work.
        input.userId ? actor.userId : null,
        input.contractId ?? null,
        input.reason,
      ],
    );

    const trust = input.providerId
      ? await recomputeTrustScore(input.providerId, "flag received", client)
      : null;

    await client.query("COMMIT");
    return { flag: toFlagDto(inserted.rows[0]!), trust };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function listProviderFlags(providerId: string): Promise<FlagDto[]> {
  const result = await query<FlagRow>(
    `SELECT ${FLAG_COLUMNS}
       FROM flags
      WHERE target_provider_id = $1::uuid
      ORDER BY created_at DESC`,
    [providerId],
  );
  return result.rows.map(toFlagDto);
}
