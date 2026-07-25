import type {
  ProviderMatch,
  ProviderSummary,
  ServiceCategory,
  ServiceRequestDto,
  SpokenLanguage,
  Urgency,
  VoiceParseResult,
} from "@zeyla/shared";
import {
  SERVICE_CATEGORIES,
  SPOKEN_LANGUAGES,
  URGENCY_LEVELS,
} from "@zeyla/shared";
import { env } from "../../../config/env.js";

/**
 * Gemini — the understanding layer between Addis AI's transcript and the
 * matcher.
 *
 * Two jobs, both of which fail open. Nothing here ever throws at a caller:
 * `understandRequest` returns null and the caller keeps the keyword parse,
 * `rankProviders` returns null and the caller keeps trust-then-distance order.
 * A customer standing in a flooded kitchen must not see an error because a
 * model endpoint is slow.
 *
 * Auth is `?key=` on the query string. The generative-language endpoint rejects
 * an Authorization header outright (401 API_KEY_SERVICE_BLOCKED), so do not be
 * tempted to "fix" this into a bearer token.
 */
const REQUEST_TIMEOUT_MS = 10_000;
/**
 * A per-minute cap clears on its own in a second or two, so one retry is worth
 * the wait to keep model-quality parsing. A daily cap does not, and Google says
 * so via a long `retryDelay` — past this we stop and fall back immediately
 * rather than make someone watch a spinner.
 */
const RETRY_DELAY_CAP_MS = 2_500;

export function isGeminiConfigured() {
  return env.GEMINI_API_KEY.length > 0;
}

/**
 * How to ask for the least deliberation the model allows.
 *
 * Each model has its own daily quota, so switching GEMINI_MODEL is how you get
 * moving again when one runs dry — but the two families spell this setting
 * differently and sending the wrong field is a flat 400, not a warning. 2.5
 * takes a token budget, and 0 is right here because extraction needs no
 * deliberation and thinking tripled latency. Gemini 3 replaced it with a level
 * and refuses to be switched off entirely, so ask for "low".
 */
function thinkingConfig(model: string): Record<string, unknown> {
  const major = Number(/^gemini-(\d+)/.exec(model)?.[1]);
  return Number.isFinite(major) && major >= 3
    ? { thinkingLevel: "low" }
    : { thinkingBudget: 0 };
}

/** Gemini's subset of JSON Schema — enough for the two response shapes below. */
interface ResponseSchema {
  type: string;
  properties?: Record<string, ResponseSchema>;
  items?: ResponseSchema;
  enum?: readonly string[];
  required?: readonly string[];
  propertyOrdering?: readonly string[];
  nullable?: boolean;
  description?: string;
}

async function generateJson<T>(
  instructions: string,
  userContent: string,
  responseSchema: ResponseSchema,
): Promise<T | null> {
  const first = await attempt<T>(instructions, userContent, responseSchema);
  if (first.outcome !== "rate_limited") return first.value;

  console.warn(
    `[gemini] rate limited, retrying once in ${first.retryAfterMs}ms`,
  );
  await sleep(first.retryAfterMs);

  const second = await attempt<T>(instructions, userContent, responseSchema);
  if (second.outcome === "rate_limited") {
    console.error(
      "[gemini] still rate limited after retry — parsing falls back to Addis AI, then keywords",
    );
    return null;
  }
  return second.value;
}

type Attempt<T> =
  | { outcome: "done"; value: T | null }
  | { outcome: "rate_limited"; retryAfterMs: number };

async function attempt<T>(
  instructions: string,
  userContent: string,
  responseSchema: ResponseSchema,
): Promise<Attempt<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url =
      `${env.GEMINI_API_BASE}/models/${encodeURIComponent(env.GEMINI_MODEL)}` +
      `:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema,
          thinkingConfig: thinkingConfig(env.GEMINI_MODEL),
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[gemini] ${response.status}: ${detail.slice(0, 300)}`);

      if (response.status === 429) {
        const advised = readRetryDelayMs(detail);
        if (advised !== null && advised <= RETRY_DELAY_CAP_MS) {
          return { outcome: "rate_limited", retryAfterMs: Math.max(advised, 500) };
        }
        // No advice, or advice we will not wait for: one short retry is still
        // worth trying when Google gave us nothing to go on.
        if (advised === null) {
          return { outcome: "rate_limited", retryAfterMs: 1_200 };
        }
      }
      return { outcome: "done", value: null };
    }

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("");
    if (!text?.trim()) return { outcome: "done", value: null };

    return { outcome: "done", value: JSON.parse(text) as T };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError" ? "timeout" : err;
    console.error("[gemini] request failed", reason);
    return { outcome: "done", value: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Google returns `{"@type":"...RetryInfo","retryDelay":"27s"}` in error details. */
function readRetryDelayMs(body: string): number | null {
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Understanding a spoken request -----------------------------------------

const UNDERSTAND_INSTRUCTIONS = `You turn a spoken service request from Addis Ababa into structured data for a marketplace that dispatches tradespeople.

The speaker uses Amharic, Afaan Oromo, or English, and often mixes them. Work from what they mean, not the words they used: "ውሃ እየፈሰሰ ነው" is a plumber, "መብራት ጠፍቷል" is an electrician.

Rules:
- category: the single trade that fixes this. Use "other" only when no listed trade fits.
- urgency: "emergency" for active damage, danger, or "right now" (flooding, sparks, gas). "high" for today. "normal" by default. "low" only when they say it can wait.
- locationLabel: the neighbourhood or landmark the speaker names, written as a local would in English (Bole, Megenagna, Ayat, Kazanchis, Piassa, Gerji, CMC, Sarbet, Kality, Summit). Transcription noise is expected: if a garbled word is clearly one of those places, correct it to the real name rather than transliterating the noise. null if they name no place — never invent one they did not say.
- summaryEn: one plain English sentence a provider can act on. Translate, do not transliterate.
- summaryLocal: the same sentence in the language the speaker used. If they spoke English, repeat summaryEn.
- keywords: 2-6 short lowercase English symptom words for matching ("leaking pipe", "no power"). Not the category name.
- confidence: how sure you are of category and urgency together. Be honest — below 0.6 makes the app ask the customer to confirm, which is the right outcome for a vague or noisy request.`;

interface UnderstandPayload {
  category: string;
  urgency: string;
  locationLabel: string | null;
  detectedLanguage: string;
  summaryEn: string;
  summaryLocal: string;
  keywords: string[];
  confidence: number;
}

const UNDERSTAND_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: SERVICE_CATEGORIES },
    urgency: { type: "string", enum: URGENCY_LEVELS },
    locationLabel: { type: "string", nullable: true },
    detectedLanguage: { type: "string", enum: SPOKEN_LANGUAGES },
    summaryEn: { type: "string" },
    summaryLocal: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: [
    "category",
    "urgency",
    "detectedLanguage",
    "summaryEn",
    "summaryLocal",
    "keywords",
    "confidence",
  ],
  propertyOrdering: [
    "category",
    "urgency",
    "locationLabel",
    "detectedLanguage",
    "summaryEn",
    "summaryLocal",
    "keywords",
    "confidence",
  ],
};

/**
 * Transcript -> the structured request the matcher runs on.
 *
 * Returns null when Gemini is unconfigured, slow, or answers with something
 * unusable, so the caller can fall back rather than fail.
 */
export async function understandRequest(
  transcript: string,
  languageHint?: string | null,
): Promise<VoiceParseResult | null> {
  if (!isGeminiConfigured()) return null;

  const prompt = languageHint
    ? `Spoken language hint from the app (may be wrong, trust the text over it): ${languageHint}\n\nTranscript:\n${transcript}`
    : `Transcript:\n${transcript}`;

  const answer = await generateJson<UnderstandPayload>(
    UNDERSTAND_INSTRUCTIONS,
    prompt,
    UNDERSTAND_SCHEMA,
  );
  if (!answer) return null;

  const category = coerceCategory(answer.category);
  if (!category) return null;

  return {
    category,
    urgency: coerceUrgency(answer.urgency) ?? "normal",
    location: {
      label: nonEmpty(answer.locationLabel),
      // Gemini names a place; it never gets to move the pin. Coordinates come
      // from device GPS only.
      lat: null,
      lng: null,
    },
    confidence: clamp01(answer.confidence, 0.7),
    source: "gemini",
    detectedLanguage: coerceLanguage(answer.detectedLanguage),
    summaryEn: nonEmpty(answer.summaryEn),
    summaryLocal: nonEmpty(answer.summaryLocal),
    keywords: Array.isArray(answer.keywords)
      ? answer.keywords
          .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
          .map((k) => k.trim().toLowerCase())
          .slice(0, 6)
      : [],
  };
}

// --- Pairing a request with providers ---------------------------------------

const RANK_INSTRUCTIONS = `You pair a customer's service request with the right provider in Addis Ababa.

You get the request and a numbered list of providers who are already confirmed to be the right trade, inside the customer's radius, and available. Your job is only to order them.

Weigh, in this order:
1. Fit — does this provider's bio and experience cover the actual symptom? A provider whose bio names the exact problem beats a generic one.
2. Trust score and review history. This is earned evidence; respect it.
3. Distance, which matters much more when urgency is "emergency" or "high".

Rules:
- Score every provider you are given, 0-100. Use the range: a strong fit is above 75, a workable one 45-70, a poor one below 30.
- reason: one sentence under 16 words, addressed to the customer, naming the concrete thing that makes this provider a good or weak fit. No marketing language, no invented facts. Only use what is in the provider's data.
- Never invent a provider and never drop one. Return exactly the ids you were given.`;

interface RankPayload {
  rankings: { id: string; score: number; reason: string }[];
}

const RANK_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    rankings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          score: { type: "number" },
          reason: { type: "string" },
        },
        required: ["id", "score", "reason"],
        propertyOrdering: ["id", "score", "reason"],
      },
    },
  },
  required: ["rankings"],
};

/**
 * Reorder an already-filtered provider shortlist by how well each fits.
 *
 * Gemini only ever reorders and annotates: the hard constraints (trade, radius,
 * availability, trust floor) were enforced in SQL before this ran, so a bad
 * ranking can produce a mediocre order but never an ineligible provider.
 * Returns null on any failure and the caller keeps the SQL order.
 */
export async function rankProviders(
  request: ServiceRequestDto,
  providers: ProviderSummary[],
): Promise<ProviderMatch[] | null> {
  if (!isGeminiConfigured() || providers.length === 0) return null;

  const nlp = request.nlp;
  const requestBlock = [
    `Category: ${request.category}`,
    `Urgency: ${request.urgency}`,
    `Problem: ${nlp?.summaryEn ?? request.description ?? request.category}`,
    nlp?.keywords.length ? `Symptoms: ${nlp.keywords.join(", ")}` : null,
    request.addressLabel ? `Area: ${request.addressLabel}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const providerBlock = providers
    .map((p, i) =>
      [
        `${i + 1}. id=${p.id}`,
        `   name: ${p.name ?? "unnamed"}`,
        `   trade: ${p.category}`,
        `   bio: ${p.bio ?? "none given"}`,
        `   experience: ${p.experienceYears} years`,
        `   trust score: ${p.trustScore}/100`,
        `   rating: ${p.avgRating === null ? "no reviews yet" : `${p.avgRating}/5 from ${p.reviewCount} reviews`}`,
        `   completed jobs: ${p.completedContracts}`,
        `   distance: ${(p.distanceMeters / 1000).toFixed(1)} km`,
        `   id verified: ${p.kycStatus === "verified" ? "yes" : "no"}`,
      ].join("\n"),
    )
    .join("\n");

  const answer = await generateJson<RankPayload>(
    RANK_INSTRUCTIONS,
    `REQUEST\n${requestBlock}\n\nPROVIDERS\n${providerBlock}`,
    RANK_SCHEMA,
  );
  if (!answer?.rankings?.length) return null;

  const byId = new Map(providers.map((p) => [p.id, p]));
  const scored: { provider: ProviderSummary; score: number; reason: string }[] = [];
  const seen = new Set<string>();

  for (const row of answer.rankings) {
    const provider = byId.get(row.id);
    if (!provider || seen.has(row.id)) continue;
    seen.add(row.id);
    scored.push({
      provider,
      score: Math.round(clamp(row.score, 0, 100, 50)),
      reason: nonEmpty(row.reason) ?? describeFallback(provider),
    });
  }

  // A dropped provider is a model mistake, not a filter. Re-add it at the back
  // on its deterministic merit so the customer never silently loses an option.
  for (const provider of providers) {
    if (seen.has(provider.id)) continue;
    scored.push({
      provider,
      score: Math.round(provider.trustScore / 2),
      reason: describeFallback(provider),
    });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.provider.distanceMeters - b.provider.distanceMeters,
  );

  return scored.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** Wording used when the model gives no usable reason, or is not consulted. */
export function describeFallback(provider: ProviderSummary): string {
  const parts = [`${(provider.distanceMeters / 1000).toFixed(1)} km away`];
  if (provider.avgRating !== null) {
    parts.push(`rated ${provider.avgRating}/5 over ${provider.reviewCount} jobs`);
  } else if (provider.completedContracts > 0) {
    parts.push(`${provider.completedContracts} jobs completed`);
  }
  parts.push(`trust ${Math.round(provider.trustScore)}/100`);
  return parts.join(" · ");
}

// --- Coercion ----------------------------------------------------------------

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

function coerceLanguage(value: unknown): SpokenLanguage | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase().slice(0, 2);
  return (SPOKEN_LANGUAGES as readonly string[]).includes(slug)
    ? (slug as SpokenLanguage)
    : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function clamp01(value: unknown, fallback: number) {
  return clamp(value, 0, 1, fallback);
}
