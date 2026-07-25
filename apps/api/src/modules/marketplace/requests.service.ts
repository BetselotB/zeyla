import type { ServiceRequestDto, Urgency, VoiceParseResult } from "@zeyla/shared";
import { query } from "../../db/client.js";
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
