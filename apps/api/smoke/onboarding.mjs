import "dotenv/config";
import pg from "pg";
import { login, makeApi, PHONES } from "./auth.mjs";

/**
 * The signup path a real user walks: Supabase email/password sign-in, session
 * exchange, KYC, provider profile, onboarding complete.
 *
 * The Supabase half is skipped (loudly, not failed) when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are unset, so this suite still runs on a laptop
 * with no keys. The phone-OTP half always runs, because that path has to keep
 * working now that accounts can be created without a phone number at all.
 *
 * Creates a throwaway Supabase user and deletes it again at the end.
 */
const PORT = process.env.ZEYLA_PORT ?? "4000";
const API = `http://localhost:${PORT}/api`;

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const supabaseReady = Boolean(SUPABASE_URL && SERVICE_KEY && ANON_KEY);

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

/** 1x1 PNG. The upload is stored as-is; nothing reads the pixels. */
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const supabaseAdmin = (path, init = {}) =>
  fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });

let createdUid = null;
let createdZeylaUserId = null;

/**
 * The account this suite creates would otherwise linger as a provider in
 * discovery results, which is the last thing anyone wants mid-demo. There is no
 * delete endpoint (by design), so cleanup goes straight to the database.
 */
async function deleteZeylaUser(userId) {
  const url = process.env.DATABASE_URL;
  if (!url || !userId) return;

  const client = new pg.Client({
    connectionString: url,
    ...(/supabase\.(co|com)/i.test(url) ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  await client.connect();
  try {
    await client.query("DELETE FROM trust_score_log WHERE provider_id = $1::uuid", [userId]);
    await client.query("DELETE FROM providers WHERE user_id = $1::uuid", [userId]);
    await client.query("DELETE FROM users WHERE id = $1::uuid", [userId]);
  } finally {
    await client.end();
  }
}

try {
  // --- Status ----------------------------------------------------------------

  const status = await api("GET", "/auth/status");
  check("GET /auth/status responds", status.status === 200, status.json.error);
  check(
    "status reports whether Supabase auth is usable",
    typeof status.json.data?.supabaseAuthEnabled === "boolean",
    status.json.data,
  );

  // --- Phone OTP still works -------------------------------------------------

  const otpToken = await login(API, PHONES.customer);
  const otpMe = await api("GET", "/auth/me", { token: otpToken });
  check("phone OTP login still resolves a user", otpMe.status === 200, otpMe.json.error);
  check(
    "an OTP account carries its phone number",
    typeof otpMe.json.data?.phone === "string",
    otpMe.json.data?.phone,
  );
  check(
    "onboardingCompleted is exposed to the route guard",
    typeof otpMe.json.data?.onboardingCompleted === "boolean",
    otpMe.json.data?.onboardingCompleted,
  );

  // --- Supabase email/password ----------------------------------------------

  if (!supabaseReady) {
    skip("Supabase email/password signup", "SUPABASE_* keys not set");
  } else {
    const email = `zeyla-smoke-${Date.now()}@example.com`;
    const password = `Sm0ke!${Date.now()}`;

    // email_confirm skips the confirmation link, which a script cannot click.
    const created = await supabaseAdmin("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Smoke Tester" },
      }),
    });
    const createdBody = await created.json();
    createdUid = createdBody.id ?? null;
    check("Supabase user created", created.ok && Boolean(createdUid), createdBody.msg ?? created.status);

    const signedIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const session = await signedIn.json();
    const token = session.access_token;
    check("password sign-in returns an access token", Boolean(token), session.error_description ?? signedIn.status);

    if (token) {
      // --- Session exchange ---------------------------------------------------

      const first = await api("POST", "/auth/session", { token });
      createdZeylaUserId = first.json.data?.user?.id ?? null;
      check("POST /auth/session creates the Zeyla account", first.status === 200, first.json.error);
      check("first exchange reports a new user", first.json.data?.isNewUser === true, first.json.data?.isNewUser);
      check(
        "the Supabase email lands on the Zeyla user",
        first.json.data?.user?.email === email,
        first.json.data?.user?.email,
      );
      check(
        "an email account has no phone number",
        first.json.data?.user?.phone === null,
        first.json.data?.user?.phone,
      );
      check(
        "the Google/email name is picked up from user_metadata",
        first.json.data?.user?.name === "Smoke Tester",
        first.json.data?.user?.name,
      );
      check(
        "a fresh account has not finished onboarding",
        first.json.data?.user?.onboardingCompleted === false,
        first.json.data?.user?.onboardingCompleted,
      );

      const second = await api("POST", "/auth/session", { token });
      check(
        "the exchange is idempotent — no second account",
        second.json.data?.isNewUser === false &&
          second.json.data?.user?.id === first.json.data?.user?.id,
        { first: first.json.data?.user?.id, second: second.json.data?.user?.id },
      );

      // --- The token works on ordinary protected routes -----------------------

      const me = await api("GET", "/auth/me", { token });
      check("a Supabase token authenticates /auth/me", me.status === 200, me.json.error);

      // --- KYC ----------------------------------------------------------------

      const kyc = await api("POST", "/auth/kyc/upload", {
        token,
        body: { idDocBase64: TINY_PNG, selfieBase64: TINY_PNG, idDocMimeType: "image/png", selfieMimeType: "image/png" },
      });
      check("KYC upload accepted", kyc.status === 200, kyc.json.error);
      check(
        "KYC_AUTO_VERIFY flips the account to verified",
        kyc.json.data?.kycStatus === "verified",
        kyc.json.data?.kycStatus,
      );
      check(
        "the response admits the verification was automatic",
        kyc.json.data?.autoVerified === true,
        kyc.json.data?.autoVerified,
      );

      // --- Provider profile ---------------------------------------------------

      const profile = await api("POST", "/marketplace/providers", {
        token,
        body: {
          category: "plumber",
          businessName: "Smoke Plumbing",
          subCity: "Bole",
          bio: "Burst pipes, blocked drains and emergency callouts across Bole.",
          experienceYears: 7,
          priceMin: 400,
          priceMax: 2500,
          contactPhone: "+251911777777",
          fullName: "Smoke Tester",
        },
      });
      check("POST /marketplace/providers creates a profile", profile.status === 201, profile.json.error);
      check("profile is reported as created", profile.json.data?.created === true, profile.json.data?.created);
      check(
        "the sub-city centroid gives the provider a location",
        typeof profile.json.data?.provider?.lat === "number" &&
          profile.json.data?.provider?.createdFromSubCityCentroid === true,
        { lat: profile.json.data?.provider?.lat, lng: profile.json.data?.provider?.lng },
      );
      check(
        "submitted KYC lifts the trust score above the base 50",
        Number(profile.json.data?.provider?.trustScore) > 50,
        profile.json.data?.provider?.trustScore,
      );

      const promoted = await api("GET", "/auth/me", { token });
      check("the account is promoted to the provider role", promoted.json.data?.role === "provider", promoted.json.data?.role);

      const again = await api("POST", "/marketplace/providers", {
        token,
        body: {
          category: "electrician",
          businessName: "Smoke Electrical",
          subCity: "Bole",
          bio: "Rewiring, fuse boards and emergency callouts across Bole.",
          experienceYears: 8,
          priceMin: 500,
          priceMax: 3000,
        },
      });
      check("resubmitting updates instead of duplicating", again.json.data?.created === false, again.json.data?.created);

      // --- Discoverable ---------------------------------------------------------

      const found = await api(
        "GET",
        "/marketplace/providers?lat=8.9944&lng=38.7889&radiusMeters=3000&category=electrician",
      );
      check(
        "the new provider is findable by the radius search",
        (found.json.data?.providers ?? []).some((p) => p.id === first.json.data?.user?.id),
        (found.json.data?.providers ?? []).map((p) => p.id),
      );

      // --- Onboarding gate ------------------------------------------------------

      const done = await api("POST", "/auth/onboarding/complete", { token });
      check("POST /auth/onboarding/complete succeeds", done.status === 200, done.json.error);
      check(
        "the gate opens",
        done.json.data?.user?.onboardingCompleted === true,
        done.json.data?.user?.onboardingCompleted,
      );

      const stillDone = await api("POST", "/auth/onboarding/complete", { token });
      check(
        "completing twice is a no-op",
        stillDone.json.data?.user?.onboardingCompleted === true,
        stillDone.json.data?.user?.onboardingCompleted,
      );
    }
  }

  // --- Rejections -------------------------------------------------------------

  const noToken = await api("POST", "/auth/session");
  check("session exchange refuses an anonymous call", noToken.status === 401, noToken.status);

  const junk = await api("POST", "/auth/session", { token: "not.a.real.jwt" });
  check("session exchange refuses a forged token", junk.status >= 400, junk.status);
} finally {
  if (createdUid) {
    await supabaseAdmin(`/admin/users/${createdUid}`, { method: "DELETE" }).catch(() => {});
  }
  await deleteZeylaUser(createdZeylaUserId).catch((err) =>
    console.log(`cleanup: could not remove Zeyla user ${createdZeylaUserId} -> ${err.message}`),
  );
  if (createdUid) console.log(`\ncleanup: removed the throwaway account`);
}

console.log(
  failures === 0
    ? `\nonboarding: all checks passed${skipped ? ` (${skipped} skipped)` : ""}`
    : `\nonboarding: ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
