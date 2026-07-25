import { login, makeApi, PHONES } from "./auth.mjs";

/**
 * The pairing path: an Amharic sentence in, the right provider out.
 *
 * Two things are being checked, and they matter for different reasons.
 *
 * The *understanding* checks (translation, category, urgency) only run when the
 * server has a Gemini key, because there is nothing to assert otherwise — the
 * keyword parser cannot translate. They are skipped, loudly, rather than failed.
 *
 * The *matching* checks run always. Trade, radius and availability are enforced
 * in SQL, so they must hold whether or not a model is involved: no cleaner may
 * ever be offered for a burst pipe, and nobody outside the radius may appear.
 */
const PORT = process.env.ZEYLA_PORT ?? "4000";
const API = `http://localhost:${PORT}/api`;

let failures = 0;
let skipped = 0;

const check = (label, cond, detail) => {
  if (!cond) failures++;
  console.log(
    `${cond ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
};

const skip = (label, why) => {
  skipped++;
  console.log(`SKIP  ${label} -> ${why}`);
};

const api = makeApi(API);

/** The customer's GPS point in the demo seed. */
const CUSTOMER = { lat: 8.995, lng: 38.787 };

const PROVIDERS = {
  abebe: "22222222-2222-4222-8222-222222222201", // plumber, ~300 m, 15 yrs, verified
  kalkidan: "22222222-2222-4222-8222-222222222202", // electrician, ~1.4 km
  meron: "22222222-2222-4222-8222-222222222204", // cleaner, ~4.5 km
  tesfaye: "22222222-2222-4222-8222-222222222205", // plumber, ~7 km — out of radius
};

try {
  const customerToken = await login(API, PHONES.customer);

  // --- Amharic in, structured request out ----------------------------------

  const amharic = "ቧንቧዬ ተሰብሮ ውሃ በየቦታው ፈሷል። ቦሌ ነኝ። አሁኑኑ እርዳታ እፈልጋለሁ።";

  const created = await api("POST", "/marketplace/voice-requests", {
    token: customerToken,
    body: { transcript: amharic, language: "am", ...CUSTOMER, radiusMeters: 5000 },
  });
  check(
    "Amharic transcript creates a request",
    created.status === 201,
    created.json.error ?? created.status,
  );

  const { request, parse } = created.json.data;
  check(
    "hears a plumbing emergency in Amharic",
    request.category === "plumber" && request.urgency === "emergency",
    { category: request.category, urgency: request.urgency, source: parse.source },
  );
  check(
    "the raw Amharic is kept verbatim for audit",
    request.voiceTranscript === amharic,
    request.voiceTranscript,
  );

  if (parse.source === "gemini") {
    check(
      "detects the spoken language",
      parse.detectedLanguage === "am",
      parse.detectedLanguage,
    );
    check(
      "translates to English for the provider to read",
      typeof parse.summaryEn === "string" &&
        parse.summaryEn.length > 0 &&
        // A translation, not a copy of the Amharic: no Ethiopic codepoints.
        !/[\u1200-\u137F]/.test(parse.summaryEn),
      parse.summaryEn,
    );
    check(
      "keeps a summary in the customer's own language",
      typeof parse.summaryLocal === "string" && parse.summaryLocal.length > 0,
      parse.summaryLocal,
    );
    check(
      "the request description is the English translation",
      request.description === parse.summaryEn,
      request.description,
    );
    check(
      "extracts symptom keywords for ranking",
      Array.isArray(parse.keywords) && parse.keywords.length > 0,
      parse.keywords,
    );
    check(
      "resolves the spoken neighbourhood to a real one",
      request.addressLabel === "Bole",
      request.addressLabel,
    );
  } else {
    skip("translation checks", `no Gemini key on the server (source=${parse.source})`);
  }

  // Device GPS wins over whatever place name was spoken.
  check(
    "the pin stays on device GPS, not the spoken place",
    request.lat === CUSTOMER.lat && request.lng === CUSTOMER.lng,
    { lat: request.lat, lng: request.lng },
  );

  // --- Ranked shortlist -----------------------------------------------------

  const matched = await api(
    "GET",
    `/marketplace/requests/${request.id}/matches?limit=5`,
    { token: customerToken },
  );
  check("matches endpoint answers", matched.status === 200, matched.json.error);

  const { matches, source: matchSource } = matched.json.data;
  check("finds plumbers nearby", matches.length > 0, matches.length);

  const ids = matches.map((m) => m.provider.id);
  check(
    "never offers the wrong trade",
    matches.every((m) => m.provider.category === "plumber"),
    matches.map((m) => m.provider.category),
  );
  check("no electrician for a burst pipe", !ids.includes(PROVIDERS.kalkidan));
  check("no cleaner for a burst pipe", !ids.includes(PROVIDERS.meron));
  check(
    "nobody outside the 5 km radius",
    !ids.includes(PROVIDERS.tesfaye),
    ids,
  );
  check(
    "every provider is inside the radius",
    matches.every((m) => m.provider.distanceMeters <= 5000),
    matches.map((m) => m.provider.distanceMeters),
  );

  check(
    "ranks are 1..n with no gaps",
    matches.every((m, i) => m.rank === i + 1),
    matches.map((m) => m.rank),
  );
  check(
    "scores never rise as rank falls",
    matches.every((m, i) => i === 0 || matches[i - 1].score >= m.score),
    matches.map((m) => m.score),
  );
  check(
    "every provider gets a reason the customer can read",
    matches.every((m) => typeof m.reason === "string" && m.reason.length > 0),
    matches.map((m) => m.reason),
  );

  if (matchSource === "gemini") {
    check(
      "the specialist in burst pipes is ranked first",
      matches[0].provider.id === PROVIDERS.abebe,
      { first: matches[0].provider.name, reason: matches[0].reason },
    );
  } else {
    skip("AI ranking check", `ranking fell back to ${matchSource}`);
  }

  // --- Committing to a pairing ---------------------------------------------

  const wrongTrade = await api(
    "POST",
    `/marketplace/requests/${request.id}/match`,
    { token: customerToken, body: { providerId: PROVIDERS.kalkidan } },
  );
  check(
    "cannot pair with a provider of the wrong trade",
    wrongTrade.status === 400,
    wrongTrade.json.error,
  );

  const outOfRange = await api(
    "POST",
    `/marketplace/requests/${request.id}/match`,
    { token: customerToken, body: { providerId: PROVIDERS.tesfaye } },
  );
  check(
    "cannot pair with a provider out of range",
    outOfRange.status === 400,
    outOfRange.json.error,
  );

  const paired = await api("POST", `/marketplace/requests/${request.id}/match`, {
    token: customerToken,
    body: { providerId: PROVIDERS.abebe },
  });
  check(
    "pairing the chosen provider pings them",
    paired.status === 201 &&
      paired.json.data.pingedProviderIds.includes(PROVIDERS.abebe),
    paired.json.data?.pingedProviderIds ?? paired.json.error,
  );
  check(
    "the request moves to pinged",
    paired.json.data?.request.status === "pinged",
    paired.json.data?.request.status,
  );
  check(
    "an emergency ping expires sooner than a normal one",
    new Date(paired.json.data.pings[0].expiresAt) - new Date(paired.json.data.pings[0].sentAt) <=
      130_000,
    paired.json.data.pings[0].expiresAt,
  );

  // --- Auto-pairing when the customer does not choose ----------------------

  const second = await api("POST", "/marketplace/voice-requests", {
    token: customerToken,
    body: {
      transcript: "No power in the kitchen, the breaker keeps tripping, today please",
      language: "en",
      ...CUSTOMER,
    },
  });
  check(
    "an electrical job is understood",
    second.json.data?.request.category === "electrician",
    second.json.data?.request.category,
  );

  const auto = await api(
    "POST",
    `/marketplace/requests/${second.json.data.request.id}/match`,
    { token: customerToken, body: { limit: 2 } },
  );
  check(
    "with no provider named, the top matches are pinged",
    auto.status === 201 && auto.json.data.pingedProviderIds.length > 0,
    auto.json.data?.pingedProviderIds ?? auto.json.error,
  );
  check(
    "auto-pairing still respects the trade",
    auto.json.data.pingedProviderIds.includes(PROVIDERS.kalkidan),
    auto.json.data.matches?.map((m) => m.provider.category),
  );

  // --- Ownership ------------------------------------------------------------

  const otherToken = await login(API, PHONES.yonas);
  const stranger = await api(
    "GET",
    `/marketplace/requests/${request.id}/matches`,
    { token: otherToken },
  );
  check(
    "another customer cannot see this request's matches",
    stranger.status === 404,
    stranger.status,
  );
} catch (err) {
  failures++;
  console.log("FAIL  threw:", err.message);
}

console.log(
  failures === 0
    ? `\nAll checks passed${skipped ? ` (${skipped} skipped)` : ""}`
    : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
