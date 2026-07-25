const PORT = process.env.ZEYLA_PORT ?? "4000";
const API = `http://localhost:${PORT}/api`;
const CUSTOMER = "11111111-1111-4111-8111-111111111111";

let failures = 0;
const check = (label, cond, detail) => {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`);
};

async function api(method, path, { actor, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(actor ? { "x-user-id": actor } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

const parse = async (transcript) =>
  (await api("POST", "/marketplace/voice/parse", { body: { transcript } })).json.data.parse;

try {
  // --- keyword parser (no API key configured here) --------------------------
  const burst = await parse("The pipe under my kitchen sink burst, water everywhere, I need someone right now in Bole");
  check("hears a plumbing emergency", burst.category === "plumber" && burst.urgency === "emergency", burst);
  check("picks up the neighbourhood", burst.location.label === "Bole", burst.location);
  check("marks itself as the offline parser", burst.source === "heuristic");

  const power = await parse("No power in half the house, the breaker keeps tripping, can someone come today");
  check("hears an electrical job", power.category === "electrician" && power.urgency === "high", power);

  const amharic = await parse("ቧንቧ ውሃ ያፈሳል አሁኑኑ እርዳታ እፈልጋለሁ");
  check("handles Amharic keywords", amharic.category === "plumber" && amharic.urgency === "emergency", amharic);

  const vague = await parse("I need some help with a thing at my house whenever you can");
  check("unknown job falls back to other/low", vague.category === "other" && vague.urgency === "low", vague);
  check("low confidence on a vague request", vague.confidence <= 0.3, vague.confidence);

  const tutor = await parse("Looking for a maths tutor for my son before his exam next week");
  check("hears a tutoring job", tutor.category === "tutor", tutor.category);

  // --- full pipeline --------------------------------------------------------
  const noAudio = await api("POST", "/marketplace/voice-requests", {
    actor: CUSTOMER, body: { lat: 8.995, lng: 38.787 },
  });
  check("audio or transcript is required", noAudio.status === 400, noAudio.json.error);

  const noKey = await api("POST", "/marketplace/voice-requests", {
    actor: CUSTOMER,
    body: { audioUrl: "https://example.com/clip.m4a", lat: 8.995, lng: 38.787 },
  });
  check("missing Whisperflow key is an honest 503", noKey.status === 503, noKey.json);

  const created = await api("POST", "/marketplace/voice-requests", {
    actor: CUSTOMER,
    body: {
      transcript: "My toilet is overflowing at Megenagna, please send a plumber immediately",
      lat: 8.995, lng: 38.787,
    },
  });
  check("voice request created -> 201", created.status === 201, created.json.error ?? created.status);
  const d = created.json.data;
  check("category and urgency come from the parse", d.request.category === "plumber" && d.request.urgency === "emergency", {
    category: d.request.category, urgency: d.request.urgency,
  });
  check("transcript is stored on the request", d.request.voiceTranscript.startsWith("My toilet"), d.request.description);
  check("parse is stored for audit", d.request.nlp.source === "heuristic", d.request.nlp);
  check("spoken place becomes a label, not the pin", d.request.addressLabel === "Megenagna" && d.request.lat === 8.995, {
    label: d.request.addressLabel, lat: d.request.lat, lng: d.request.lng,
  });
  check("transcript source is reported", d.transcription.source === "client_supplied");

  const weak = await api("POST", "/marketplace/voice-requests", {
    actor: CUSTOMER,
    body: { transcript: "Hello I need somebody to help me please", lat: 8.995, lng: 38.787 },
  });
  check("weak parse still creates a request but asks to confirm", weak.status === 201 && weak.json.data.needsConfirmation === true, {
    category: weak.json.data.request.category, confidence: weak.json.data.parse.confidence,
  });

  // The voice request must be pingable like any other.
  const fan = await api("POST", `/marketplace/requests/${d.request.id}/pings`, {
    actor: CUSTOMER, body: { maxProviders: 3, onlineOnly: false },
  });
  check("a voice request pings providers like any other", fan.status === 201 && fan.json.data.pings.length > 0, fan.json.data.pingedProviderIds);

  // --- trust explanation with ?explain=ai (no key -> template) --------------
  const ai = await api("GET", "/trust/providers/22222222-2222-4222-8222-222222222201?explain=ai");
  check("explain=ai degrades to the template without a key", ai.status === 200 && ai.json.data.explanation.source === "template", ai.json.data.explanation.source);
  check("explanation still has its factors", ai.json.data.explanation.factors.length === 6);
} catch (err) {
  failures++;
  console.log("FAIL  threw:", err.message);
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
