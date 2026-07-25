import { login, makeApi, PHONES } from "./auth.mjs";

const PORT = process.env.ZEYLA_PORT ?? "4000";
const API = `http://localhost:${PORT}/api`;

let failures = 0;
const check = (label, cond, detail) => {
  if (!cond) failures++;
  console.log(
    `${cond ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
};

const api = makeApi(API);

/**
 * Which stage answered depends on which keys the server has, so these suites
 * assert the understanding is *correct* rather than which model produced it.
 * The one thing always required is that the stage identifies itself honestly.
 */
const KNOWN_SOURCES = ["gemini", "addis_ai", "heuristic"];

try {
  const customerToken = await login(API, PHONES.customer);

  const parse = async (transcript) =>
    (
      await api("POST", "/marketplace/voice/parse", {
        token: customerToken,
        body: { transcript },
      })
    ).json.data.parse;

  const burst = await parse(
    "The pipe under my kitchen sink burst, water everywhere, I need someone right now in Bole",
  );
  check(
    "hears a plumbing emergency",
    burst.category === "plumber" && burst.urgency === "emergency",
    burst,
  );
  check("picks up the neighbourhood", burst.location.label === "Bole", burst.location);
  check(
    "names the stage that understood it",
    KNOWN_SOURCES.includes(burst.source),
    burst.source,
  );

  const power = await parse(
    "No power in half the house, the breaker keeps tripping, can someone come today",
  );
  check(
    "hears an electrical job",
    power.category === "electrician" && power.urgency === "high",
    power,
  );

  const amharic = await parse("ቧንቧ ውሃ ያፈሳል አሁኑኑ እርዳታ እፈልጋለሁ");
  check(
    "handles Amharic keywords",
    amharic.category === "plumber" && amharic.urgency === "emergency",
    amharic,
  );

  const vague = await parse(
    "I need some help with a thing at my house whenever you can",
  );
  check(
    "unknown job falls back to other/low",
    vague.category === "other" && vague.urgency === "low",
    vague,
  );
  // Below the 0.6 floor is what actually matters: it triggers the confirm step.
  check("low confidence on a vague request", vague.confidence < 0.6, vague.confidence);

  const tutor = await parse(
    "Looking for a maths tutor for my son before his exam next week",
  );
  check("hears a tutoring job", tutor.category === "tutor", tutor.category);

  const noAudio = await api("POST", "/marketplace/voice-requests", {
    token: customerToken,
    body: { lat: 8.995, lng: 38.787 },
  });
  check("audio or transcript is required", noAudio.status === 400, noAudio.json.error);

  const badAudio = await api("POST", "/marketplace/voice-requests", {
    token: customerToken,
    body: {
      audioUrl: "https://example.com/clip-that-does-not-exist.m4a",
      lat: 8.995,
      lng: 38.787,
    },
  });
  check(
    "unfetchable audio fails with an honest reason, never a 500",
    badAudio.status >= 400 && badAudio.status < 504 && badAudio.status !== 500,
    { status: badAudio.status, error: badAudio.json.error },
  );

  const created = await api("POST", "/marketplace/voice-requests", {
    token: customerToken,
    body: {
      transcript:
        "My toilet is overflowing at Megenagna, please send a plumber immediately",
      lat: 8.995,
      lng: 38.787,
    },
  });
  check(
    "voice request created -> 201",
    created.status === 201,
    created.json.error ?? created.status,
  );
  const d = created.json.data;
  check(
    "category and urgency come from the parse",
    d.request.category === "plumber" && d.request.urgency === "emergency",
    { category: d.request.category, urgency: d.request.urgency },
  );
  check(
    "transcript is stored on the request",
    d.request.voiceTranscript.startsWith("My toilet"),
    d.request.description,
  );
  check(
    "parse is stored for audit",
    KNOWN_SOURCES.includes(d.request.nlp?.source),
    d.request.nlp,
  );
  check(
    "spoken place becomes a label, not the pin",
    d.request.addressLabel === "Megenagna" && d.request.lat === 8.995,
    { label: d.request.addressLabel, lat: d.request.lat, lng: d.request.lng },
  );
  check("transcript source is reported", d.transcription.source === "client_supplied");

  const weak = await api("POST", "/marketplace/voice-requests", {
    token: customerToken,
    body: {
      transcript: "Hello I need somebody to help me please",
      lat: 8.995,
      lng: 38.787,
    },
  });
  check(
    "weak parse still creates a request but asks to confirm",
    weak.status === 201 && weak.json.data.needsConfirmation === true,
    {
      category: weak.json.data.request.category,
      confidence: weak.json.data.parse.confidence,
    },
  );

  const fan = await api("POST", `/marketplace/requests/${d.request.id}/pings`, {
    token: customerToken,
    body: { maxProviders: 3, onlineOnly: false },
  });
  check(
    "a voice request pings providers like any other",
    fan.status === 201 && fan.json.data.pings.length > 0,
    fan.json.data.pingedProviderIds,
  );

  const ai = await api(
    "GET",
    "/trust/providers/22222222-2222-4222-8222-222222222201?explain=ai",
  );
  check(
    "explain=ai answers either way — model or template",
    ai.status === 200 &&
      ["template", "addis_ai"].includes(ai.json.data.explanation.source),
    ai.json.data.explanation.source,
  );
  // The factors are computed, never generated, so the model cannot drop one.
  check("explanation still has its factors", ai.json.data.explanation.factors.length === 6);
} catch (err) {
  failures++;
  console.log("FAIL  threw:", err.message);
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
