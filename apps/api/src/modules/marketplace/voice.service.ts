import type {
  ServiceCategory,
  ServiceRequestDto,
  Urgency,
  VoiceParseResult,
  VoiceTranscriptResult,
} from "@zeyla/shared";
import {
  isAddisConfigured,
  parseServiceRequest,
  transcribeWithAddis,
} from "./ai/addisAi.js";
import { understandRequest } from "./ai/gemini.js";
import { isWhisperflowConfigured, transcribe } from "./ai/whisperflow.js";
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
  /** Corrections from the confirm screen. A customer beats the model. */
  category?: ServiceCategory;
  urgency?: Urgency;
}

export interface VoiceRequestResult {
  request: ServiceRequestDto;
  transcription: VoiceTranscriptResult;
  parse: VoiceParseResult;
  /** True when the parse is weak enough that the UI should confirm before pinging. */
  needsConfirmation: boolean;
}

const CONFIDENCE_FLOOR = 0.6;

/**
 * Audio -> text. Addis AI first because it is trained on Amharic and Afaan
 * Oromo; Whisperflow only if someone configures a key for it.
 */
export async function resolveTranscript(
  input: Pick<VoiceRequestInput, "audioUrl" | "audioBase64" | "transcript" | "mimeType" | "language">,
): Promise<VoiceTranscriptResult> {
  if (input.transcript?.trim()) {
    return {
      transcript: input.transcript.trim(),
      language: input.language ?? null,
      durationSeconds: null,
      source: "client_supplied",
      confidence: null,
    };
  }

  if (!input.audioUrl && !input.audioBase64) {
    throw ApiError.badRequest("audio_or_transcript_required");
  }

  if (isAddisConfigured()) {
    try {
      return await transcribeWithAddis(input);
    } catch (err) {
      // Only worth retrying elsewhere if a second transcriber actually exists.
      if (!isWhisperflowConfigured()) throw err;
      console.error("[voice] Addis AI STT failed, trying Whisperflow", err);
    }
  }

  return transcribe({
    audioUrl: input.audioUrl,
    audioBase64: input.audioBase64,
    mimeType: input.mimeType,
    language: input.language,
  });
}

/**
 * Recent parses, keyed by the exact text that produced them.
 *
 * One customer journey asks the same question twice: `/classify` for the confirm
 * screen, then `/voice-requests` for the real thing. The parse is deterministic
 * (temperature 0), so the second call can only ever repeat the first — and the
 * Gemini free tier allows 5 requests per minute, which a couple of demo runs
 * exhausts. Caching turns three model calls per journey into two.
 *
 * Deliberately in-process and tiny: it is a de-duplicator for one journey, not a
 * cache anyone should depend on. A restart or a second API instance simply pays
 * for the parse again.
 */
const PARSE_CACHE_TTL_MS = 10 * 60_000;
const PARSE_CACHE_MAX = 200;
const parseCache = new Map<string, { at: number; parse: VoiceParseResult }>();

function cacheKey(transcript: string, languageHint?: string | null) {
  return `${languageHint ?? ""}::${transcript}`;
}

function readCache(key: string): VoiceParseResult | null {
  const hit = parseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > PARSE_CACHE_TTL_MS) {
    parseCache.delete(key);
    return null;
  }
  return hit.parse;
}

function writeCache(key: string, parse: VoiceParseResult) {
  // Insertion-ordered, so the oldest key is the first one Map yields.
  if (parseCache.size >= PARSE_CACHE_MAX) {
    const oldest = parseCache.keys().next().value;
    if (oldest !== undefined) parseCache.delete(oldest);
  }
  parseCache.set(key, { at: Date.now(), parse });
}

/**
 * Transcript -> structured request.
 *
 * Gemini first: it translates Amharic or Afaan Oromo into the English the rest
 * of the system speaks and recovers intent from a garbled transcript, which
 * matters because STT on a phone in a noisy room mangles words. Addis AI's chat
 * model is second, and a keyword parser catches everything, so this never
 * throws — a weak parse becomes a confirm screen, not an error.
 */
export async function interpretTranscript(
  transcript: string,
  languageHint?: string | null,
): Promise<VoiceParseResult> {
  const key = cacheKey(transcript, languageHint);
  const cached = readCache(key);
  if (cached) return cached;

  const understood = await understandRequest(transcript, languageHint);
  if (understood) {
    writeCache(key, understood);
    return understood;
  }

  console.warn("[voice] Gemini unavailable, falling back to Addis AI parse");
  const parsed = await parseServiceRequest(transcript);
  // Only cache a model answer. A keyword fallback is what we produce when the
  // good path is briefly down, and caching it would outlive the outage.
  if (parsed.source !== "heuristic") writeCache(key, parsed);
  return parsed;
}

/**
 * Addis AI -> Gemini -> a real service request.
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
  const parsed = await interpretTranscript(
    transcription.transcript,
    input.language ?? transcription.language,
  );

  // A correction from the confirm screen is a fact, not a guess, so it replaces
  // the model's answer and takes the confidence with it.
  const corrected = Boolean(input.category || input.urgency);
  const parse: VoiceParseResult = corrected
    ? {
        ...parsed,
        category: input.category ?? parsed.category,
        urgency: input.urgency ?? parsed.urgency,
        confidence: 1,
      }
    : parsed;

  const request = await createServiceRequest(actor, {
    category: parse.category,
    // Prefer the English translation: the provider reading this ping may not
    // share the customer's language. The raw transcript is kept alongside it.
    description: parse.summaryEn ?? transcription.transcript,
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
    needsConfirmation:
      !corrected && (parse.confidence < CONFIDENCE_FLOOR || parse.category === "other"),
  };
}
