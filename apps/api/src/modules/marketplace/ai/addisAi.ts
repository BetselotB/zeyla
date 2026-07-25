import type { ServiceCategory, Urgency, VoiceParseResult } from "@zeyla/shared";
import { SERVICE_CATEGORIES, URGENCY_LEVELS } from "@zeyla/shared";
import { env } from "../../../config/env.js";

/**
 * Addis AI — turns a spoken request into { category, urgency, location }, and
 * rewrites trust explanations.
 *
 * Never throws and never blocks a request: if the key is missing, the call
 * fails, or the model answers with something unusable, we fall back to the
 * keyword parser below. A customer standing in a flooded kitchen should not see
 * an error because an NLP endpoint is down.
 *
 * NOTE: the wire format is the usual chat-completions shape and is unverified
 * against a real account. Confirm before the demo; only this file changes.
 */
const REQUEST_TIMEOUT_MS = 8_000;

export function isAddisConfigured() {
  return env.ADDIS_AI_API_KEY.length > 0;
}

const PARSE_INSTRUCTIONS = `You extract structured service requests for an Ethiopian marketplace.
Answer with JSON only: {"category": string, "urgency": string, "location": string|null, "confidence": number}.
category must be one of: ${SERVICE_CATEGORIES.join(", ")}.
urgency must be one of: ${URGENCY_LEVELS.join(", ")}.
location is the place named by the speaker (an Addis Ababa neighbourhood or landmark), or null.
confidence is 0 to 1. The speaker may use Amharic or English.`;

export async function parseServiceRequest(
  transcript: string,
): Promise<VoiceParseResult> {
  const fallback = heuristicParse(transcript);
  if (!isAddisConfigured()) return fallback;

  try {
    const answer = await completeJson(PARSE_INSTRUCTIONS, transcript);
    if (!answer) return fallback;

    const category = coerceCategory(answer.category);
    const urgency = coerceUrgency(answer.urgency);
    if (!category) return fallback;

    return {
      category,
      urgency: urgency ?? fallback.urgency,
      location: {
        label: typeof answer.location === "string" ? answer.location : fallback.location.label,
        lat: null,
        lng: null,
      },
      confidence:
        typeof answer.confidence === "number"
          ? Math.min(1, Math.max(0, answer.confidence))
          : 0.7,
      source: "addis_ai",
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
    const answer = await completeJson(EXPLAIN_INSTRUCTIONS, facts);
    const summary = answer?.summary;
    return typeof summary === "string" && summary.trim().length > 0
      ? summary.trim()
      : null;
  } catch (err) {
    console.error("[addis-ai] explanation rewrite failed, keeping template", err);
    return null;
  }
}

async function completeJson(
  instructions: string,
  userContent: string,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // AbortSignal alone is not enough if DNS/TLS stalls before the request is
  // abortable — race a hard timeout so the keyword fallback always wins by
  // REQUEST_TIMEOUT_MS, never hangs a customer request.
  const timedOut = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("addis_ai_timeout")), REQUEST_TIMEOUT_MS + 250);
  });

  try {
    const response = await Promise.race([
      fetch(`${env.ADDIS_AI_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.ADDIS_AI_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: env.ADDIS_AI_MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: userContent },
          ],
        }),
        signal: controller.signal,
      }),
      timedOut,
    ]);

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      output_text?: string;
    };
    const content = payload.choices?.[0]?.message?.content ?? payload.output_text;
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
  };
}

function matchLocationPhrase(transcript: string): string | null {
  const match = transcript.match(/\b(?:in|at|near|around)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2})/);
  return match?.[1]?.trim() ?? null;
}
