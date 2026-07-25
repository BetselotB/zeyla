import type {
  ServiceCategory,
  Urgency,
  VoiceParseResult,
  VoiceTranscriptResult,
} from "@zeyla/shared";
import { SERVICE_CATEGORIES, URGENCY_LEVELS } from "@zeyla/shared";
import { env } from "../../../config/env.js";
import { ApiError } from "../lib/errors.js";

/**
 * Addis AI — Amharic and Afaan Oromo speech.
 *
 * This is the transcription step of record. Generic speech-to-text does badly
 * on Amharic phonemes; Addis AI is trained on them, which is the whole reason
 * it sits in front of Gemini rather than the other way round.
 *
 * Endpoints (verified against a live key, do not "tidy" these):
 *   POST /api/v2/stt            multipart. `audio` file + `request_data`, which
 *                               must be a plain text field holding JSON. Adding
 *                               a content-type to that part makes the server
 *                               answer `language_code is required`.
 *   POST /api/v1/chat_generate  JSON. Used as the parsing fallback when Gemini
 *                               is unavailable.
 * Both answer `{ status, data: { ... } }` and authenticate with `x-api-key`.
 */
/**
 * Transcription is the one stage with no substitute, so it gets a long leash.
 * Measured 4-7s for a 5s clip, with occasional slower responses; cutting it off
 * at 20s turned a working request into a failed one.
 */
const STT_TIMEOUT_MS = 30_000;
const CHAT_TIMEOUT_MS = 8_000;

export function isAddisConfigured() {
  return env.ADDIS_AI_API_KEY.length > 0;
}

/** Addis AI only accepts these two; anything else transcribes better elsewhere. */
function sttLanguageCode(language?: string | null): "am" | "om" {
  return language?.trim().toLowerCase().startsWith("om") ? "om" : "am";
}

export interface TranscribeInput {
  audioBase64?: string;
  audioUrl?: string;
  mimeType?: string;
  /** "am" or "om". Anything else is treated as Amharic. */
  language?: string;
}

/**
 * Speech to text. Throws ApiError so the caller can report a real reason —
 * unlike the parsing step, there is no offline substitute for a transcript.
 */
export async function transcribeWithAddis(
  input: TranscribeInput,
): Promise<VoiceTranscriptResult> {
  if (!isAddisConfigured()) {
    throw ApiError.unavailable("addis_ai_not_configured", {
      hint: "Set ADDIS_AI_API_KEY, or post `transcript` instead of audio.",
    });
  }

  const audio = await readAudio(input);
  const language = sttLanguageCode(input.language);

  const form = new FormData();
  form.append("audio", new Blob([audio.bytes], { type: audio.mimeType }), audio.filename);
  form.append("request_data", JSON.stringify({ language_code: language }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.ADDIS_AI_API_BASE}/api/v2/stt`, {
      method: "POST",
      // No content-type header: fetch must set the multipart boundary itself.
      headers: { "x-api-key": env.ADDIS_AI_API_KEY },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw ApiError.unavailable("addis_stt_failed", {
        status: response.status,
        detail: detail.slice(0, 300),
      });
    }

    const payload = (await response.json()) as {
      data?: { transcription?: unknown; confidence?: unknown };
      transcription?: unknown;
      confidence?: unknown;
    };
    const transcript =
      readString(payload.data?.transcription) ?? readString(payload.transcription);
    if (!transcript) throw ApiError.unavailable("addis_stt_empty_transcript");

    return {
      transcript,
      language,
      durationSeconds: null,
      source: "addis_ai",
      confidence: readNumber(payload.data?.confidence) ?? readNumber(payload.confidence),
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw ApiError.unavailable("addis_stt_timeout");
    }
    throw ApiError.unavailable("addis_stt_unreachable", {
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }
}

interface AudioPayload {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}

async function readAudio(input: TranscribeInput): Promise<AudioPayload> {
  if (input.audioBase64) {
    // Browsers hand us a data URI; strip the prefix and prefer its declared type.
    const match = /^data:([^;,]+)?(?:;[^,]*)*,(.*)$/s.exec(input.audioBase64);
    const declared = match?.[1];
    const base64 = match?.[2] ?? input.audioBase64;
    const mimeType = input.mimeType ?? declared ?? "audio/webm";

    let bytes: Buffer;
    try {
      bytes = Buffer.from(base64, "base64");
    } catch {
      throw ApiError.badRequest("audio_base64_invalid");
    }
    if (bytes.length === 0) throw ApiError.badRequest("audio_base64_empty");

    return { bytes, mimeType, filename: filenameFor(mimeType) };
  }

  if (input.audioUrl) {
    const response = await fetch(input.audioUrl);
    if (!response.ok) {
      throw ApiError.badRequest("audio_url_unreachable", { status: response.status });
    }
    const mimeType =
      input.mimeType ?? response.headers.get("content-type") ?? "audio/webm";
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType,
      filename: filenameFor(mimeType),
    };
  }

  throw ApiError.badRequest("audio_required");
}

/** The API keys off the extension as well as the part's content type. */
function filenameFor(mimeType: string): string {
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  const extensions: Record<string, string> = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
  };
  return `voice.${extensions[base] ?? "webm"}`;
}

// --- Chat model: parsing fallback and trust wording -------------------------

const PARSE_INSTRUCTIONS = `You extract structured service requests for an Ethiopian marketplace.
Answer with JSON only: {"category": string, "urgency": string, "location": string|null, "confidence": number}.
category must be one of: ${SERVICE_CATEGORIES.join(", ")}.
urgency must be one of: ${URGENCY_LEVELS.join(", ")}.
location is the place named by the speaker (an Addis Ababa neighbourhood or landmark), or null.
confidence is 0 to 1. The speaker may use Amharic, Afaan Oromo, or English.`;

/**
 * Second-choice parser, used when Gemini is unavailable. Never throws: a bad
 * answer here falls through to the keyword parser.
 */
export async function parseServiceRequest(
  transcript: string,
): Promise<VoiceParseResult> {
  const fallback = heuristicParse(transcript);
  if (!isAddisConfigured()) return fallback;

  try {
    const answer = await chatJson(PARSE_INSTRUCTIONS, transcript);
    if (!answer) return fallback;

    const category = coerceCategory(answer.category);
    if (!category) return fallback;

    return {
      category,
      urgency: coerceUrgency(answer.urgency) ?? fallback.urgency,
      location: {
        label:
          typeof answer.location === "string" ? answer.location : fallback.location.label,
        lat: null,
        lng: null,
      },
      confidence:
        typeof answer.confidence === "number"
          ? Math.min(1, Math.max(0, answer.confidence))
          : 0.7,
      source: "addis_ai",
      detectedLanguage: null,
      summaryEn: null,
      summaryLocal: null,
      keywords: [],
    };
  } catch (err) {
    console.error("[addis-ai] parse failed, using keyword parser", err);
    return fallback;
  }
}

const EXPLAIN_INSTRUCTIONS = `You rewrite a trust score explanation for a marketplace app.
Answer with JSON only: {"summary": string}.
Rules: one short paragraph, at most 45 words, plain English a phone user understands.
Use ONLY the facts given. Never invent numbers, never add reassurance that is not in the facts.`;

/**
 * Rephrase an explanation. The caller keeps the deterministic factor list, so
 * the model only ever changes wording — it cannot invent a reason for a score.
 */
export async function rewriteTrustSummary(facts: string): Promise<string | null> {
  if (!isAddisConfigured()) return null;

  try {
    const answer = await chatJson(EXPLAIN_INSTRUCTIONS, facts);
    return readString(answer?.summary);
  } catch (err) {
    console.error("[addis-ai] explanation rewrite failed, keeping template", err);
    return null;
  }
}

async function chatJson(
  instructions: string,
  userContent: string,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.ADDIS_AI_API_BASE}/api/v1/chat_generate`, {
      method: "POST",
      headers: {
        "x-api-key": env.ADDIS_AI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.ADDIS_AI_MODEL,
        // The chat model takes one prompt string, not a message array.
        prompt: `${instructions}\n\n${userContent}`,
        target_language: "en",
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      data?: { response_text?: unknown };
      response_text?: unknown;
    };
    const content =
      readString(payload.data?.response_text) ?? readString(payload.response_text);
    if (!content) return null;

    return JSON.parse(stripCodeFence(content)) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coerceCategory(value: unknown): ServiceCategory | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase().replace(/\s+/g, "_");
  return (SERVICE_CATEGORIES as readonly string[]).includes(slug)
    ? (slug as ServiceCategory)
    : null;
}

function coerceUrgency(value: unknown): Urgency | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return (URGENCY_LEVELS as readonly string[]).includes(slug)
    ? (slug as Urgency)
    : null;
}

// --- Offline fallback --------------------------------------------------------

/** English + Amharic keywords, since customers dictate in either. */
const CATEGORY_KEYWORDS: Record<ServiceCategory, string[]> = {
  plumber: ["plumb", "pipe", "leak", "tap", "faucet", "drain", "toilet", "water heater", "ቧንቧ", "ውሃ"],
  electrician: ["electric", "wiring", "socket", "breaker", "power", "generator", "light", "ኤሌክትሪክ", "መብራት"],
  carpenter: ["carpent", "wood", "door", "cabinet", "shelf", "furniture", "አናጢ", "በር"],
  cleaner: ["clean", "cleaning", "housekeep", "laundry", "ጽዳት", "ማጽዳት"],
  painter: ["paint", "repaint", "wall colour", "wall color", "ቀለም"],
  mechanic: ["mechanic", "car", "engine", "tyre", "tire", "brake", "መኪና", "ጎማ"],
  mover: ["move", "moving", "relocat", "haul", "transport", "ማጓጓዝ", "እቃ"],
  gardener: ["garden", "lawn", "hedge", "plant", "አትክልት"],
  appliance_repair: ["fridge", "refrigerator", "washing machine", "microwave", "stove", "oven", "tv repair"],
  tutor: ["tutor", "teach", "lesson", "homework", "exam", "ትምህርት"],
  other: [],
};

const URGENCY_KEYWORDS: { urgency: Urgency; words: string[] }[] = [
  { urgency: "emergency", words: ["emergency", "urgent", "right now", "immediately", "flooding", "burst", "fire", "አደጋ", "አሁኑኑ"] },
  { urgency: "high", words: ["today", "as soon as", "asap", "quickly", "soon", "ዛሬ"] },
  { urgency: "low", words: ["whenever", "no rush", "next week", "sometime"] },
];

/** Addis Ababa areas people actually say. */
const KNOWN_AREAS = [
  "bole", "piassa", "megenagna", "sarbet", "kazanchis", "gerji", "cmc", "ayat",
  "summit", "lebu", "kality", "mexico", "arat kilo", "sidist kilo", "gulele",
  "kolfe", "jemo", "saris", "hayahulet", "medhanialem", "shiro meda",
];

export function heuristicParse(transcript: string): VoiceParseResult {
  const text = transcript.toLowerCase();

  let category: ServiceCategory = "other";
  let bestHits = 0;
  for (const [slug, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = words.filter((w) => text.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      category = slug as ServiceCategory;
    }
  }

  let urgency: Urgency = "normal";
  for (const rule of URGENCY_KEYWORDS) {
    if (rule.words.some((w) => text.includes(w))) {
      urgency = rule.urgency;
      break;
    }
  }

  const area = KNOWN_AREAS.find((a) => text.includes(a));
  const label = area
    ? area.replace(/\b\w/g, (c) => c.toUpperCase())
    : matchLocationPhrase(transcript);

  return {
    category,
    urgency,
    location: { label, lat: null, lng: null },
    // Honest about being a keyword match: the UI shows a confirm step below ~0.6.
    confidence: bestHits > 0 ? Math.min(0.6, 0.3 + bestHits * 0.15) : 0.2,
    source: "heuristic",
    detectedLanguage: null,
    summaryEn: null,
    summaryLocal: null,
    keywords: [],
  };
}

function matchLocationPhrase(transcript: string): string | null {
  const match = transcript.match(/\b(?:in|at|near|around)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2})/);
  return match?.[1]?.trim() ?? null;
}
