import type {
  ActiveJobSummary,
  ServiceRequestDto,
  Urgency,
  VoiceParseResult,
} from "@zeyla/shared";
import { query } from "../../db/client.js";
import {
  disputeContractForCancellation,
  paymentSummariesByRequest,
} from "../escrow/service.js";
import { notify } from "../notifications/notifications.service.js";
import { releaseFromJob } from "./availability.service.js";
import type { Actor } from "./lib/actor.js";
import { ApiError } from "./lib/errors.js";

export interface RequestRow {
  id: string;
  user_id: string;
  category: string;
  description: string | null;
  urgency: string;
  lat: number;
  lng: number;
  address_label: string | null;
  radius_meters: number;
  status: string;
  voice_transcript: string | null;
  nlp: VoiceParseResult | null;
  created_at: Date;
}

const REQUEST_COLUMNS = `
  id, user_id, category, description, urgency, lat, lng, address_label,
  radius_meters, status, voice_transcript, nlp, created_at`;

/** The same list, qualified, for the joins below. */
const R_REQUEST_COLUMNS = REQUEST_COLUMNS.replace(/(\w+)/g, "r.$1");

export function toRequestDto(row: RequestRow): ServiceRequestDto {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    description: row.description,
    urgency: row.urgency as Urgency,
    lat: Number(row.lat),
    lng: Number(row.lng),
    addressLabel: row.address_label,
    radiusMeters: row.radius_meters,
    status: row.status as ServiceRequestDto["status"],
    voiceTranscript: row.voice_transcript,
    nlp: row.nlp,
    createdAt: row.created_at.toISOString(),
  };
}

export interface CreateRequestInput {
  category: string;
  description: string | null;
  urgency: Urgency;
  lat: number;
  lng: number;
  addressLabel: string | null;
  radiusMeters: number;
  voiceTranscript?: string | null;
  nlp?: VoiceParseResult | null;
}

export async function createServiceRequest(
  actor: Actor,
  input: CreateRequestInput,
): Promise<ServiceRequestDto> {
  const result = await query<RequestRow>(
    `INSERT INTO service_requests
       (user_id, category, description, urgency, lat, lng, address_label,
        radius_meters, voice_transcript, nlp)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     RETURNING ${REQUEST_COLUMNS}`,
    [
      actor.userId,
      input.category,
      input.description,
      input.urgency,
      input.lat,
      input.lng,
      input.addressLabel,
      input.radiusMeters,
      input.voiceTranscript ?? null,
      input.nlp ? JSON.stringify(input.nlp) : null,
    ],
  );

  return toRequestDto(result.rows[0]!);
}

export async function getServiceRequest(requestId: string): Promise<ServiceRequestDto> {
  const result = await query<RequestRow>(
    `SELECT ${REQUEST_COLUMNS} FROM service_requests WHERE id = $1::uuid`,
    [requestId],
  );
  const row = result.rows[0];
  if (!row) throw ApiError.notFound("request");
  return toRequestDto(row);
}

/** 404 rather than 403 for a stranger's request — do not confirm it exists. */
export async function getOwnedServiceRequest(
  actor: Actor,
  requestId: string,
): Promise<ServiceRequestDto> {
  const request = await getServiceRequest(requestId);
  if (request.userId !== actor.userId) throw ApiError.notFound("request");
  return request;
}

export async function listServiceRequests(
  actor: Actor,
  limit = 20,
): Promise<ServiceRequestDto[]> {
  const result = await query<RequestRow>(
    `SELECT ${REQUEST_COLUMNS}
       FROM service_requests
      WHERE user_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT $2::int`,
    [actor.userId, limit],
  );
  return result.rows.map(toRequestDto);
}

/** Statuses that still count as "this job is not over yet". */
const OPEN_STATUSES = ["pending", "pinged", "accepted", "in_progress"] as const;

/**
 * Close the marketplace request behind a contract that has just been paid out.
 *
 * Escrow owns the money and stops at `completed`; the request it was raised
 * against is this module's row to close. Without this the customer would stay
 * locked out of booking again by a job they had already finished and paid for.
 *
 * Guarded on the current status so a duplicate event, or a request the
 * customer cancelled in the meantime, cannot reopen or overwrite anything.
 */
export async function completeRequestForContract(requestId: string): Promise<void> {
  await query(
    `UPDATE service_requests
        SET status = 'completed', updated_at = now()
      WHERE id = $1::uuid
        AND status = ANY($2::request_status[])`,
    [requestId, OPEN_STATUSES],
  );
}

/**
 * The one job this customer already has in flight, if any.
 *
 * Discovery calls this before letting anyone start a second request. Newest
 * first, because a customer who somehow ended up with two open rows should be
 * pointed at the one they were just looking at.
 */
export async function getActiveJob(actor: Actor): Promise<ActiveJobSummary | null> {
  const result = await query<
    RequestRow & { provider_id: string | null; provider_name: string | null }
  >(
    `SELECT ${R_REQUEST_COLUMNS},
            p.provider_id,
            u.name AS provider_name
       FROM service_requests r
       LEFT JOIN pings p
              ON p.request_id = r.id AND p.status = 'accepted'
       LEFT JOIN users u ON u.id = p.provider_id
      WHERE r.user_id = $1::uuid
        AND r.status = ANY($2::request_status[])
        -- Belt and braces: if the event that closes the request above was ever
        -- lost, a finished contract still must not lock the customer out.
        AND NOT EXISTS (
              SELECT 1 FROM contracts c
               WHERE c.request_id = r.id AND c.status = 'completed'
            )
      ORDER BY r.created_at DESC
      LIMIT 1`,
    [actor.userId, OPEN_STATUSES],
  );

  const row = result.rows[0];
  if (!row) return null;

  const request = toRequestDto(row);
  const payments = await paymentSummariesByRequest({
    requestIds: [request.id],
    partyId: actor.userId,
  });
  const payment = payments.get(request.id) ?? null;

  return {
    request,
    providerId: row.provider_id,
    providerName: row.provider_name,
    payment,
    isPaid: payment?.isPaid === true,
    isBlocking: true,
  };
}

/**
 * Customer abandons their own request.
 *
 * The money decides what "cancelled" means: an unfunded request just closes,
 * while a funded one goes to dispute so the held ETB is resolved deliberately
 * rather than vanishing with the request.
 *
 * A job that is already finished is the interesting case. Escrow will not let
 * a completed contract be disputed, and refusing the cancel outright used to
 * leave the customer staring at a job they had already paid for and could
 * neither clear nor replace. So a finished job is reconciled instead of
 * rejected: the request is closed to match the contract, which is what the
 * customer was really asking for.
 */
export async function cancelOwnRequest(
  actor: Actor,
  requestId: string,
): Promise<{ request: ServiceRequestDto }> {
  const existing = await getOwnedServiceRequest(actor, requestId);
  if (existing.status === "cancelled") return { request: existing };
  if (existing.status === "completed") return { request: existing };

  const payments = await paymentSummariesByRequest({
    requestIds: [requestId],
    partyId: actor.userId,
  });
  if (payments.get(requestId)?.status === "completed") {
    return { request: await setRequestStatus(requestId, "completed") };
  }

  await disputeContractForCancellation(
    requestId,
    actor.userId,
    "customer cancelled the job",
  );
  const request = await setRequestStatus(requestId, "cancelled");

  // Whoever took it is free to work again, and deserves to be told why the job
  // disappeared from their inbox.
  const accepted = await query<{ provider_id: string }>(
    `SELECT provider_id FROM pings
      WHERE request_id = $1::uuid AND status = 'accepted'`,
    [requestId],
  );

  for (const { provider_id: providerId } of accepted.rows) {
    await releaseFromJob(providerId);
    await notify({
      userId: providerId,
      type: "ping_declined",
      title: "Customer cancelled the job",
      body: "This request is closed. Any funded payment has been placed in dispute.",
      data: { requestId, userId: actor.userId },
    });
  }

  return { request };
}

export async function setRequestStatus(
  requestId: string,
  status: ServiceRequestDto["status"],
): Promise<ServiceRequestDto> {
  const result = await query<RequestRow>(
    `UPDATE service_requests
        SET status = $2::request_status, updated_at = now()
      WHERE id = $1::uuid
      RETURNING ${REQUEST_COLUMNS}`,
    [requestId, status],
  );
  const row = result.rows[0];
  if (!row) throw ApiError.notFound("request");
  return toRequestDto(row);
}
