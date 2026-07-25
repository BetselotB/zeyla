import type { VoiceTranscriptResult } from "@zeyla/shared";
import { env } from "../../../config/env.js";
import { ApiError } from "../lib/errors.js";

/**
 * Whisperflow speech-to-text.
 *
 * DORMANT. `api.whisperflow.ai` does not resolve and no account exists, so with
 * WHISPERFLOW_API_KEY unset the STT chain skips this file entirely and uses
 * Addis AI (see ./addisAi.ts), which is trained on Amharic and Afaan Oromo and
 * is the better transcriber for this product regardless. Kept as an escape
 * hatch: set the key and it becomes the fallback when Addis AI is down.
 *
 * The key is read from the environment on every call rather than captured at
 * import time, so nothing here ever holds a literal secret and a key added to
 * .env takes effect on the next request.
 *
 * The request/response shape below is unverified against a real account.
 */
const REQUEST_TIMEOUT_MS = 15_000;

export interface TranscribeInput {
  audioUrl?: string;
  audioBase64?: string;
  mimeType?: string;
  /** BCP-47 hint, e.g. "am" for Amharic. */
  language?: string;
}

export function isWhisperflowConfigured() {
  return env.WHISPERFLOW_API_KEY.length > 0;
}

export async function transcribe(
  input: TranscribeInput,
): Promise<VoiceTranscriptResult> {
  if (!isWhisperflowConfigured()) {
    throw ApiError.unavailable("whisperflow_not_configured", {
      hint: "Set WHISPERFLOW_API_KEY, or post `transcript` directly instead of audio.",
    });
  }
  if (!input.audioUrl && !input.audioBase64) {
    throw ApiError.badRequest("audio_required");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.WHISPERFLOW_API_BASE}/transcriptions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.WHISPERFLOW_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: input.audioUrl,
        audio: input.audioBase64,
        mime_type: input.mimeType,
        language: input.language,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw ApiError.unavailable("whisperflow_failed", {
        status: response.status,
        detail: detail.slice(0, 300),
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const transcript = readTranscript(payload);
    if (!transcript) throw ApiError.unavailable("whisperflow_empty_transcript");

    return {
      transcript,
      language: readString(payload, "language") ?? input.language ?? null,
      durationSeconds: readNumber(payload, "duration"),
      source: "whisperflow",
      confidence: readNumber(payload, "confidence"),
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw ApiError.unavailable("whisperflow_timeout");
    }
    throw ApiError.unavailable("whisperflow_unreachable", {
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }
}

function readTranscript(payload: Record<string, unknown>): string | null {
  const direct = payload.text ?? payload.transcript;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const data = payload.data as Record<string, unknown> | undefined;
  const nested = data?.text ?? data?.transcript;
  if (typeof nested === "string" && nested.trim()) return nested.trim();

  const results = payload.results as { text?: unknown }[] | undefined;
  const first = results?.[0]?.text;
  return typeof first === "string" && first.trim() ? first.trim() : null;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" ? value : null;
}
