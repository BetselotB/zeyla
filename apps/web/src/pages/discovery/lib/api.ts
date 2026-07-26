import type { ApiResponse, ProviderTrustDto } from "@zeyla/shared";
import type {
  LanguageCode,
  MatchResult,
  ProviderMatch,
  ProviderSummary,
  ServiceRequestDto,
  TrustBreakdown,
  VoiceParseResult,
  VoiceTranscriptResult,
} from "./types.js";
import { API_BASE, clearToken, ensureSession } from "./session.js";

/**
 * Discovery's API client.
 *
 * Errors propagate. An earlier version answered every failure with mock data,
 * which meant a broken endpoint looked like a working one and the UI silently
 * demoed fake providers — the screens below show a real message instead.
 */

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Off for public reads, so browsing providers works before any login. */
  auth?: boolean;
  query?: Record<string, string | number | boolean | undefined>;
}

async function call<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, query } = options;

  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth) headers.authorization = `Bearer ${await ensureSession()}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // A stale token outlives a database reset in development. Drop it so the next
  // call re-provisions rather than looping on 401.
  if (res.status === 401 && auth) clearToken();

  const envelope = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!envelope?.success || envelope.data == null) {
    throw new Error(envelope?.error ?? `request_failed_${res.status}`);
  }
  return envelope.data;
}

// --- Voice -------------------------------------------------------------------

/** Strips the `data:audio/webm;base64,` prefix the FileReader adds. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("audio_read_failed"));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** Amharic or Afaan Oromo speech to text, via Addis AI on the server. */
export async function transcribe(
  audioBlob: Blob,
  language: LanguageCode,
): Promise<VoiceTranscriptResult> {
  const data = await call<{ transcription: VoiceTranscriptResult }>("/marketplace/transcribe", {
    method: "POST",
    body: {
      audioBase64: await toBase64(audioBlob),
      mimeType: audioBlob.type || "audio/webm",
      language,
    },
  });
  return data.transcription;
}

/** Same call, for callers that only want the text. */
export async function transcribeText(
  audioBlob: Blob,
  language: LanguageCode,
): Promise<string> {
  return (await transcribe(audioBlob, language)).transcript;
}

/**
 * Transcript to a structured request: translated, categorised, and given an
 * urgency. Nothing is created yet, so the customer can correct it first.
 */
export async function classify(
  transcript: string,
  language: LanguageCode,
): Promise<VoiceParseResult> {
  const data = await call<{ parse: VoiceParseResult }>("/marketplace/classify", {
    method: "POST",
    body: { transcript, language },
  });
  return data.parse;
}

// --- Requests ----------------------------------------------------------------

export interface CreateRequestInput {
  transcript: string;
  language: LanguageCode;
  lat: number;
  lng: number;
  radiusMeters?: number;
  /** Only send these when the customer corrected the confirm screen. */
  category?: VoiceParseResult["category"];
  urgency?: VoiceParseResult["urgency"];
}

/**
 * Commit the request. The server re-reads the transcript rather than trusting
 * whatever the browser inferred, so the stored request reflects what the
 * pipeline understood — unless the customer explicitly corrected it.
 */
export async function createRequest(
  input: CreateRequestInput,
): Promise<{ request: ServiceRequestDto; parse: VoiceParseResult; needsConfirmation: boolean }> {
  return call("/marketplace/voice-requests", { method: "POST", body: input });
}

export async function getRequest(
  requestId: string,
): Promise<{ request: ServiceRequestDto }> {
  return call(`/marketplace/requests/${requestId}`);
}

/** Public profile. Browsing is open, so this needs no token. */
export async function getProvider(providerId: string): Promise<ProviderSummary> {
  return call<ProviderSummary>(`/marketplace/providers/${providerId}`, {
    auth: false,
  });
}

// --- Matching ----------------------------------------------------------------

/** Ranked providers for this request, best fit first, each with a reason. */
export async function getMatches(
  requestId: string,
  limit = 5,
): Promise<MatchResult> {
  return call<MatchResult>(`/marketplace/requests/${requestId}/matches`, {
    query: { limit },
  });
}

/** Ping the chosen provider. Omit `providerId` to let the ranking decide. */
export async function matchProvider(
  requestId: string,
  providerId?: string,
): Promise<{ request: ServiceRequestDto; matches: ProviderMatch[] }> {
  return call(`/marketplace/requests/${requestId}/match`, {
    method: "POST",
    body: providerId ? { providerId } : {},
  });
}

// --- Trust -------------------------------------------------------------------

/**
 * Score plus the "why this score" text. `explain=ai` rephrases the same facts.
 *
 * The endpoint returns the explanation as a structured object; the panels
 * below want one sentence, so the summary line is what gets carried through.
 */
export async function getTrustBreakdown(
  providerId: string,
): Promise<TrustBreakdown> {
  const data = await call<ProviderTrustDto>(`/trust/providers/${providerId}`, {
    auth: false,
    query: { explain: "ai" },
  });
  return { ...data.breakdown, explanation: data.explanation.summary };
}
