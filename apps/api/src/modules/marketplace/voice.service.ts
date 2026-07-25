import type {
  ServiceRequestDto,
  VoiceParseResult,
  VoiceTranscriptResult,
} from "@zeyla/shared";
import { parseServiceRequest } from "./ai/addisAi.js";
import { transcribe } from "./ai/whisperflow.js";
import type { Actor } from "./lib/actor.js";
import { ApiError } from "./lib/errors.js";
import { createServiceRequest } from "./requests.service.js";

export interface VoiceRequestInput {
  /** Supply one of these three. */
  audioUrl?: string;
  audioBase64?: string;
  transcript?: string;
  mimeType?: string;
  language?: string;
  /** Device GPS. The spoken location is only a label — it never moves the pin. */
  lat: number;
  lng: number;
  radiusMeters?: number;
}

export interface VoiceRequestResult {
  request: ServiceRequestDto;
  transcription: VoiceTranscriptResult;
  parse: VoiceParseResult;
  /** True when the parse is weak enough that the UI should confirm before pinging. */
  needsConfirmation: boolean;
}

const CONFIDENCE_FLOOR = 0.6;

export async function resolveTranscript(
  input: Pick<VoiceRequestInput, "audioUrl" | "audioBase64" | "transcript" | "mimeType" | "language">,
): Promise<VoiceTranscriptResult> {
  if (input.transcript?.trim()) {
    return {
      transcript: input.transcript.trim(),
      language: input.language ?? null,
      durationSeconds: null,
      source: "client_supplied",
    };
  }

  if (!input.audioUrl && !input.audioBase64) {
    throw ApiError.badRequest("audio_or_transcript_required");
  }

  return transcribe({
    audioUrl: input.audioUrl,
    audioBase64: input.audioBase64,
    mimeType: input.mimeType,
    language: input.language,
  });
}

/**
 * Whisperflow -> Addis AI -> a real service request.
 *
 * The request is created even on a weak parse, with `needsConfirmation` set:
 * the customer fixes the category on the confirm screen rather than being told
 * to record again. The device GPS always wins over the spoken place name — a
 * misheard neighbourhood must never send providers to the wrong side of town.
 */
export async function createRequestFromVoice(
  actor: Actor,
  input: VoiceRequestInput,
): Promise<VoiceRequestResult> {
  const transcription = await resolveTranscript(input);
  const parse = await parseServiceRequest(transcription.transcript);

  const request = await createServiceRequest(actor, {
    category: parse.category,
    description: transcription.transcript,
    urgency: parse.urgency,
    lat: input.lat,
    lng: input.lng,
    addressLabel: parse.location.label,
    radiusMeters: input.radiusMeters ?? 5000,
    voiceTranscript: transcription.transcript,
    nlp: parse,
  });

  return {
    request,
    transcription,
    parse,
    needsConfirmation: parse.confidence < CONFIDENCE_FLOOR || parse.category === "other",
  };
}
