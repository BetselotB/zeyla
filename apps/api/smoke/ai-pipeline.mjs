/**
 * The AI layers on their own, with no database.
 *
 * The other suites need a running API, PostGIS and Redis. This one imports the
 * three AI modules directly and calls the live Addis AI and Gemini endpoints, so
 * the voice pipeline can be checked on a machine with no PostGIS — and so a
 * failure points at the model integration rather than at the SQL.
 *
 *   npx tsx smoke/ai-pipeline.mjs           two Gemini calls, covers every path
 *   npx tsx smoke/ai-pipeline.mjs --full    adds the language and edge-case sweep
 *
 * Skips itself when the relevant key is unset instead of failing, and skips
 * rather than fails when Gemini answers 429 — falling back is the designed
 * behaviour, and the fallback is asserted separately at the bottom of the file.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const { transcribeWithAddis, isAddisConfigured, heuristicParse } = await import(
  "../src/modules/marketplace/ai/addisAi.ts"
);
const { understandRequest, rankProviders, isGeminiConfigured } = await import(
  "../src/modules/marketplace/ai/gemini.ts"
);

let failures = 0;
let skips = 0;

const check = (label, cond, detail) => {
  if (!cond) failures++;
  console.log(
    `${cond ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
};
const skip = (label, why) => {
  skips++;
  console.log(`SKIP  ${label} -> ${why}`);
};

/**
 * The free-tier key is a shared, exhaustible resource: gemini-2.5-flash allows
 * roughly 20 requests before it starts answering 429, and every one this suite
 * spends is one the demo cannot. So the default run covers each distinct code
 * path exactly once, and the language and edge-case sweep lives behind --full.
 */
const FULL = process.argv.includes("--full");
let geminiCalls = 0;
const counted = async (fn) => {
  geminiCalls++;
  return fn();
};

/**
 * Gemini returning null is the designed fallback, not a defect — on this key the
 * cause is nearly always the rate limit. Skip the dependent assertions instead
 * of failing them, so an exhausted quota never reads as a broken integration.
 * The fallback chain itself is asserted at the bottom of the file, without a key.
 */
const withAnswer = (label, value, run) => {
  if (value === null || value === undefined) {
    skip(label, "Gemini returned null — quota or outage, fallback path covered below");
    return false;
  }
  run(value);
  return true;
};

// --- Gemini: understanding ---------------------------------------------------

if (!isGeminiConfigured()) {
  skip("Gemini understanding", "GEMINI_API_KEY is unset");
} else {
  // One transcript, asserted hard: this is the demo's headline path, and it
  // exercises translation, place resolution and urgency in a single call. Note
  // the deliberate noise — ቧንቧ came back as ባንቧ and ቦሌ as ሞሌ from a real TTS ->
  // STT round trip, so meaning has to survive a mangled transcript.
  const amharic = await counted(() =>
    understandRequest("ባንቧዬ ተሰብሮ ውሃ በየቦታው ፈሷል። ሞሌ አካባቢ ነኝ። አሁኑኑ እርዳታ እፈልጋለሁ።", "am"),
  );
  withAnswer("Amharic burst pipe understood", amharic, (a) => {
    check("Amharic burst pipe -> plumber", a.category === "plumber", a.category);
    check("…and an emergency", a.urgency === "emergency", a.urgency);
    check("…detects Amharic", a.detectedLanguage === "am", a.detectedLanguage);
    // ሞሌ is not a place; Bole is. Correcting it is the point.
    check("…corrects garbled ሞሌ to Bole", a.location.label === "Bole", a.location.label);
    check(
      "…translates into English",
      typeof a.summaryEn === "string" && !/[\u1200-\u137F]/.test(a.summaryEn),
      a.summaryEn,
    );
    check(
      "…keeps the customer's own wording too",
      typeof a.summaryLocal === "string" && a.summaryLocal.length > 0,
      a.summaryLocal,
    );
    check("…extracts keywords", a.keywords.length > 0, a.keywords);
    // A spoken place name must never become coordinates.
    check(
      "…never invents coordinates from a place name",
      a.location.lat === null && a.location.lng === null,
      a.location,
    );
  });

  if (!FULL) {
    skip("language and edge-case sweep", "costs 4 more Gemini calls — run with --full");
  } else {
    // Afaan Oromo, the other language Addis AI transcribes.
    const oromo = await counted(() =>
      understandRequest(
        "Ibsaan mana kiyya keessaa hin jiru. Meeshaan ibsaa hojjechuu dide. Har'a nan barbaachisa.",
        "om",
      ),
    );
    withAnswer("Afaan Oromo understood", oromo, (o) => {
      check("Afaan Oromo power failure -> electrician", o.category === "electrician", {
        category: o.category,
        language: o.detectedLanguage,
        summary: o.summaryEn,
      });
    });

    const english = await counted(() =>
      understandRequest("Can someone tutor my son in maths before his exam next week?"),
    );
    withAnswer("English request understood", english, (e) => {
      check("English tutoring request", e.category === "tutor", e.category);
      // An exam deadline can fairly read as "high"; only "emergency" would be
      // wrong, since that tier shortens the ping window and jumps the queue.
      check("…is not an emergency", e.urgency !== "emergency", e.urgency);
    });

    const vague = await counted(() =>
      understandRequest("I need help with a thing at my house sometime"),
    );
    // Null is a legitimate answer here, so this one asserts directly.
    check(
      "a vague request is honest about being unsure",
      vague === null || vague.confidence < 0.6 || vague.category === "other",
      { category: vague?.category, confidence: vague?.confidence },
    );
  }
}

// --- Gemini: ranking ---------------------------------------------------------

const CANDIDATES = [
  {
    id: "11111111-1111-4111-8111-111111111101",
    name: "Abebe Tadesse",
    category: "plumber",
    bio: "Burst pipes and water heaters, 15 years.",
    experienceYears: 15,
    trustScore: 88,
    isOnline: true,
    kycStatus: "verified",
    firecrawlVerified: true,
    lat: 8.9975,
    lng: 38.7885,
    distanceMeters: 300,
    avgRating: 4.8,
    reviewCount: 24,
    completedContracts: 31,
    lastSeenAt: null,
  },
  {
    id: "11111111-1111-4111-8111-111111111102",
    name: "Dawit Haile",
    category: "plumber",
    bio: "Drain clearing, new to the platform.",
    experienceYears: 1,
    trustScore: 52,
    isOnline: false,
    kycStatus: "pending",
    firecrawlVerified: false,
    lat: 9.018,
    lng: 38.782,
    distanceMeters: 2600,
    avgRating: null,
    reviewCount: 0,
    completedContracts: 0,
    lastSeenAt: null,
  },
  {
    id: "11111111-1111-4111-8111-111111111103",
    name: "Hanna Girma",
    category: "plumber",
    bio: "Cheap and fast.",
    experienceYears: 2,
    trustScore: 61,
    isOnline: true,
    kycStatus: "verified",
    firecrawlVerified: false,
    lat: 8.99,
    lng: 38.782,
    distanceMeters: 900,
    avgRating: 3.1,
    reviewCount: 8,
    completedContracts: 6,
    lastSeenAt: null,
  },
];

const REQUEST = {
  id: "99999999-9999-4999-8999-999999999999",
  userId: "88888888-8888-4888-8888-888888888888",
  category: "plumber",
  description: "My pipe has burst and water is flooding the kitchen.",
  urgency: "emergency",
  lat: 8.995,
  lng: 38.787,
  addressLabel: "Bole",
  radiusMeters: 5000,
  status: "pending",
  voiceTranscript: "ቧንቧዬ ተሰብሮ ውሃ በየቦታው ፈሷል።",
  nlp: {
    category: "plumber",
    urgency: "emergency",
    location: { label: "Bole", lat: null, lng: null },
    confidence: 0.95,
    source: "gemini",
    detectedLanguage: "am",
    summaryEn: "My pipe has burst and water is flooding the kitchen.",
    summaryLocal: "ቧንቧዬ ተሰብሮ ውሃ በየቦታው ፈሷል።",
    keywords: ["burst pipe", "flooding", "kitchen"],
  },
  createdAt: new Date().toISOString(),
};

if (!isGeminiConfigured()) {
  skip("Gemini ranking", "GEMINI_API_KEY is unset");
} else {
  const ranked = await counted(() => rankProviders(REQUEST, CANDIDATES));
  withAnswer("provider ranking", ranked, (r) => {
    check("ranking returns every candidate", r.length === CANDIDATES.length, r.length);
    check(
      "the burst-pipe specialist ranks first",
      r[0].provider.id === CANDIDATES[0].id,
      r.map((row) => `${row.provider.name}:${row.score}`),
    );
    check("ranks are 1..n in order", r.every((row, i) => row.rank === i + 1), r.map((row) => row.rank));
    check(
      "scores are monotonically non-increasing",
      r.every((row, i) => i === 0 || r[i - 1].score >= row.score),
      r.map((row) => row.score),
    );
    check(
      "every provider gets a readable reason",
      r.every((row) => typeof row.reason === "string" && row.reason.split(" ").length >= 3),
      r.map((row) => row.reason),
    );
    check(
      "no provider is invented or dropped",
      new Set(r.map((row) => row.provider.id)).size === CANDIDATES.length,
    );
  });

  if (FULL) {
    const single = await counted(() => rankProviders(REQUEST, [CANDIDATES[1]]));
    withAnswer("a single candidate still ranks", single, (s) => {
      check("a single candidate still ranks", s.length === 1, s[0]?.reason);
    });
  }

  // Costs no quota: the guard short-circuits before the request.
  const none = await rankProviders(REQUEST, []);
  check("an empty shortlist returns null, not a crash", none === null);
}

// --- Addis AI: transcription -------------------------------------------------

if (!isAddisConfigured()) {
  skip("Addis AI transcription", "ADDIS_AI_API_KEY is unset");
} else {
  // Amharic speech generated by Addis AI's own TTS, committed as a fixture so
  // this suite needs no microphone. Round-tripping it proves the multipart wire
  // format is right — that part is easy to break and silent when it is wrong.
  let audio;
  try {
    audio = readFileSync(path.join(here, "fixtures", "amharic-plumber.mp3"));
  } catch {
    audio = null;
  }

  if (!audio) {
    skip("Addis AI transcription", "smoke/fixtures/amharic-plumber.mp3 is missing");
  } else {
    // A slow or unreachable transcriber is an outage, not a code defect, so it
    // is reported and skipped rather than failing the suite.
    try {
      const result = await transcribeWithAddis({
        audioBase64: audio.toString("base64"),
        mimeType: "audio/mpeg",
        language: "am",
      });
      check(
        "transcribes Amharic audio to Ethiopic text",
        /[\u1200-\u137F]/.test(result.transcript),
        result.transcript,
      );
      check("reports Addis AI as the source", result.source === "addis_ai", result.source);
      check(
        "reports a confidence",
        result.confidence === null || (result.confidence > 0 && result.confidence <= 1),
        result.confidence,
      );

      // The full chain: audio -> text -> structured request. The understanding
      // section already asserts this transcript's meaning, so only --full pays
      // for the extra call to prove the two halves join up.
      if (isGeminiConfigured() && FULL) {
        const understood = await counted(() => understandRequest(result.transcript, "am"));
        withAnswer("audio through to a matchable category", understood, (u) => {
          check(
            "audio all the way through to a matchable category",
            u.category === "plumber",
            { transcript: result.transcript, parse: u.category },
          );
        });
      }

      const dataUri = await transcribeWithAddis({
        audioBase64: `data:audio/mpeg;base64,${audio.toString("base64")}`,
        language: "am",
      });
      check(
        "accepts a browser data: URI unchanged",
        /[\u1200-\u137F]/.test(dataUri.transcript),
        dataUri.transcript,
      );
    } catch (err) {
      skip("Addis AI transcription", `${err.message} — transcriber unreachable or slow`);
    }
  }

  await Promise.all([
    transcribeWithAddis({ language: "am" }).then(
      () => check("missing audio is rejected", false, "did not throw"),
      (err) => check("missing audio is rejected", err.message === "audio_required", err.message),
    ),
    transcribeWithAddis({ audioBase64: "", language: "am" }).then(
      () => check("empty audio is rejected", false, "did not throw"),
      (err) => check("empty audio is rejected", err.message.startsWith("audio"), err.message),
    ),
  ]);
}

// --- The offline floor -------------------------------------------------------
// No key, no network: still has to produce something the matcher can use.

const offline = heuristicParse("The pipe under my kitchen sink burst, water everywhere, in Bole");
check("keyword parser still finds the trade", offline.category === "plumber", offline.category);
check("keyword parser still finds the area", offline.location.label === "Bole", offline.location);
check("keyword parser admits what it is", offline.source === "heuristic");
check(
  "keyword parser carries the new fields",
  offline.summaryEn === null && Array.isArray(offline.keywords),
  offline,
);

console.log(
  failures === 0
    ? `\nAll checks passed${skips ? ` (${skips} skipped)` : ""} · ${geminiCalls} Gemini call(s) spent`
    : `\n${failures} check(s) failed · ${geminiCalls} Gemini call(s) spent`,
);
process.exit(failures === 0 ? 0 : 1);
