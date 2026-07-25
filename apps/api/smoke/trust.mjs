import { login, makeApi, PHONES } from "./auth.mjs";
import { resetTrustFixtures } from "./fixtures.mjs";

const PORT = process.env.ZEYLA_PORT ?? "4000";
const API = `http://localhost:${PORT}/api`;
const ABEBE = "22222222-2222-4222-8222-222222222201";
const KALKIDAN = "22222222-2222-4222-8222-222222222202";
const DAWIT = "22222222-2222-4222-8222-222222222203";
const TESFAYE = "22222222-2222-4222-8222-222222222205";
const HANNA = "22222222-2222-4222-8222-222222222206";

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(
    `${condition ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
}

const api = makeApi(API);
const near = (a, b) => Math.abs(a - b) < 0.011;

try {
  await resetTrustFixtures();

  const customerToken = await login(API, PHONES.customer);
  const yonasToken = await login(API, PHONES.yonas);
  const kalkidanToken = await login(API, PHONES.kalkidan);

  for (const id of [ABEBE, KALKIDAN, DAWIT, TESFAYE, HANNA]) {
    await api("POST", `/trust/providers/${id}/recompute`, {
      token: customerToken,
      body: { reason: "seed backfill" },
    });
  }

  const abebe = (await api("GET", `/trust/providers/${ABEBE}`)).json.data;
  check("Abebe score matches hand calculation", near(abebe.trustScore, 103.33), {
    score: abebe.trustScore,
    breakdown: abebe.breakdown,
  });
  check("completed contracts capped at +20", abebe.breakdown.completedContracts === 20);

  const kal = (await api("GET", `/trust/providers/${KALKIDAN}`)).json.data;
  check("Kalkidan score matches hand calculation", near(kal.trustScore, 83.5), kal.trustScore);

  const dawit = (await api("GET", `/trust/providers/${DAWIT}`)).json.data;
  check("brand new provider sits at the base 50", near(dawit.trustScore, 50), dawit.trustScore);
  check("no reviews means no review points", dawit.breakdown.reviewBonus === 0);
  check("no ID submitted means no KYC points", dawit.stats.kycSubmitted === false);

  const tes = (await api("GET", `/trust/providers/${TESFAYE}`)).json.data;
  check(
    "rejected KYC earns nothing",
    tes.stats.kycSubmitted === false && tes.breakdown.kycBonus === 0,
    tes.trustScore,
  );

  const hanna = (await api("GET", `/trust/providers/${HANNA}`)).json.data;
  check("flags subtract 5 each", near(hanna.trustScore, 57), {
    score: hanna.trustScore,
    flags: hanna.stats.flagsReceived,
    penalty: hanna.breakdown.flagPenalty,
  });

  check(
    "explanation has a headline",
    abebe.explanation.headline.startsWith("Trust score 103.3"),
    abebe.explanation.headline,
  );
  check("explanation covers all six factors", abebe.explanation.factors.length === 6);
  check(
    "explanation summary reads as a sentence",
    abebe.explanation.summary.includes("10 jobs") &&
      abebe.explanation.summary.endsWith("out of 105."),
    abebe.explanation.summary,
  );
  check("explanation source is the template", abebe.explanation.source === "template");
  console.log("      " + abebe.explanation.summary);
  console.log("      " + hanna.explanation.summary);

  const history = (await api("GET", `/trust/providers/${ABEBE}/history`)).json.data
    .entries;
  check("recompute logged a change", history.length >= 1, history[0]);
  check(
    "log records previous and new score",
    history[0].previousScore === 50 && near(history[0].newScore, 103.33),
    history[0],
  );
  check("log carries the reason", history[0].reason === "seed backfill");

  const before = history.length;
  await api("POST", `/trust/providers/${ABEBE}/recompute`, {
    token: customerToken,
    body: { reason: "no-op" },
  });
  const after = (await api("GET", `/trust/providers/${ABEBE}/history`)).json.data
    .entries;
  check("recompute with no change writes no log row", after.length === before, {
    before,
    after: after.length,
  });

  const wrongState = await api("POST", "/trust/reviews", {
    token: customerToken,
    body: {
      contractId: "33333333-3333-4333-8333-333333333390",
      rating: 5,
    },
  });
  check(
    "cannot review a contract that is not completed",
    wrongState.status === 409,
    wrongState.json.error,
  );

  const dupe = await api("POST", "/trust/reviews", {
    token: customerToken,
    body: {
      contractId: "33333333-3333-4333-8333-333333333301",
      rating: 5,
    },
  });
  check("cannot review the same contract twice", dupe.status === 409, dupe.json.error);

  const notMine = await api("POST", "/trust/reviews", {
    token: yonasToken,
    body: {
      contractId: "33333333-3333-4333-8333-333333333304",
      rating: 5,
    },
  });
  check("cannot review someone else's contract", notMine.status === 404, notMine.json.error);

  const badRating = await api("POST", "/trust/reviews", {
    token: customerToken,
    body: {
      contractId: "33333333-3333-4333-8333-333333333304",
      rating: 9,
    },
  });
  check("rating must be 1-5", badRating.status === 400, badRating.json.error);

  const scoreBefore = (await api("GET", `/trust/providers/${ABEBE}`)).json.data
    .trustScore;
  const review = await api("POST", "/trust/reviews", {
    token: customerToken,
    body: {
      contractId: "33333333-3333-4333-8333-333333333304",
      rating: 1,
      comment: "Left the job half done",
    },
  });
  check("review accepted -> 201", review.status === 201, review.json.error ?? review.status);
  check("review response carries the new trust score", review.json.data.trust.changed === true, {
    from: review.json.data.trust.previousScore,
    to: review.json.data.trust.trustScore,
  });
  const scoreAfter = (await api("GET", `/trust/providers/${ABEBE}`)).json.data
    .trustScore;
  check("a 1-star review drops the score", scoreAfter < scoreBefore, {
    before: scoreBefore,
    after: scoreAfter,
  });
  check(
    "trust log explains the drop",
    (
      await api("GET", `/trust/providers/${ABEBE}/history`)
    ).json.data.entries[0].reason.startsWith("review: 1-star"),
  );

  const search = await api("GET", `/marketplace/providers/${ABEBE}`);
  check(
    "discovery reflects the recomputed score",
    near(search.json.data.trustScore, scoreAfter),
    search.json.data.trustScore,
  );

  const selfFlag = await api("POST", "/trust/flags", {
    token: customerToken,
    body: { userId: "11111111-1111-4111-8111-111111111111", reason: "testing" },
  });
  check("cannot flag yourself", selfFlag.status === 400, selfFlag.json.error);

  const bothTargets = await api("POST", "/trust/flags", {
    token: customerToken,
    body: {
      userId: "11111111-1111-4111-8111-111111111112",
      providerId: DAWIT,
      reason: "testing",
    },
  });
  check("flag needs exactly one target", bothTargets.status === 400, bothTargets.json.error);

  const flag = await api("POST", "/trust/flags", {
    token: customerToken,
    body: {
      providerId: KALKIDAN,
      reason: "Quoted 500, demanded 900 on arrival",
    },
  });
  check("flagging a provider -> 201", flag.status === 201, flag.json.error ?? flag.status);
  check("flag costs exactly 5 points", near(flag.json.data.trust.delta, -5), {
    delta: flag.json.data.trust.delta,
    to: flag.json.data.trust.trustScore,
  });

  const again = await api("POST", "/trust/flags", {
    token: customerToken,
    body: { providerId: KALKIDAN, reason: "same complaint again" },
  });
  check("same reporter cannot flag twice", again.status === 409, again.json.error);

  const second = await api("POST", "/trust/flags", {
    token: yonasToken,
    body: { providerId: KALKIDAN, reason: "Did not show up" },
  });
  check("a different reporter can flag", second.status === 201, second.json.error ?? second.status);
  check(
    "two flags cost 10 in total",
    near(second.json.data.trust.trustScore, 73.5),
    second.json.data.trust.trustScore,
  );

  const userFlag = await api("POST", "/trust/flags", {
    token: kalkidanToken,
    body: {
      userId: "11111111-1111-4111-8111-111111111112",
      reason: "Refused to pay after the job",
    },
  });
  check("provider can flag a user", userFlag.status === 201, userFlag.json.error ?? userFlag.status);
  check("flagging a user changes no trust score", userFlag.json.data.trust === null);

  const flagged = (await api("GET", `/trust/providers/${KALKIDAN}/flags`)).json.data
    .flags;
  check("provider flags are listed", flagged.length === 2, flagged.length);
} catch (err) {
  failures++;
  console.log("FAIL  threw:", err.message);
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
