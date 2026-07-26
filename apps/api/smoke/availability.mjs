/**
 * Smoke test: provider availability drives discoverability.
 *
 * Proves the one rule the feature rests on — a provider who is offline is not
 * pinged, and turning the switch on is what puts them back on the radar.
 *
 *   node smoke/availability.mjs            (API must already be running)
 *   API_URL=http://localhost:4000 node smoke/availability.mjs
 */

const API = `${process.env.API_URL ?? "http://localhost:4000"}/api`;

const PROVIDER_PHONE = "0911777001";
const CUSTOMER_PHONE = "0911777002";
/** Bole, so provider and customer are metres apart and always in radius. */
const POINT = { lat: 8.9944, lng: 38.7889 };

let failures = 0;

function check(label, condition, detail) {
  const mark = condition ? "✓" : "✗";
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function call(path, { method = "GET", body, token, query } = {}) {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const envelope = await res.json().catch(() => null);
  return { status: res.status, ok: envelope?.success === true, body: envelope };
}

async function signIn(phone) {
  const requested = await call("/auth/otp/request", {
    method: "POST",
    body: { phone },
  });
  const code = requested.body?.data?.devCode;
  if (!code) throw new Error(`no dev code for ${phone} — is AUTH_OTP_PROVIDER=mock?`);

  const verified = await call("/auth/otp/verify", {
    method: "POST",
    body: { phone, code },
  });
  const token = verified.body?.data?.token;
  if (!token) throw new Error(`could not sign in ${phone}`);
  return token;
}

async function main() {
  console.log("→ signing in");
  const provider = await signIn(PROVIDER_PHONE);
  const customer = await signIn(CUSTOMER_PHONE);

  console.log("\n→ provider profile");
  const profile = await call("/marketplace/providers", {
    method: "POST",
    token: provider,
    body: {
      category: "plumber",
      businessName: "Availability Smoke Plumbing",
      subCity: "Bole",
      bio: "Seeded by the availability smoke test. Safe to delete.",
      experienceYears: 5,
      priceMin: 300,
      priceMax: 1500,
      serviceRadiusMeters: 10_000,
      ...POINT,
    },
  });
  check("provider profile upserted", profile.ok, profile.body?.error ?? "");
  const providerId = profile.body?.data?.provider?.providerId;

  // --- Offline ---------------------------------------------------------------

  console.log("\n→ going offline");
  const offline = await call("/marketplace/providers/me/availability", {
    method: "PUT",
    token: provider,
    body: { status: "offline" },
  });
  check(
    "status is offline and not discoverable",
    offline.body?.data?.availability?.status === "offline" &&
      offline.body?.data?.availability?.isDiscoverable === false,
    JSON.stringify(offline.body?.data?.availability?.status),
  );

  const hiddenSearch = await call("/marketplace/providers", {
    query: { ...POINT, radiusMeters: 5000, category: "plumber", onlineOnly: true },
  });
  check(
    "offline provider is absent from an online-only search",
    !hiddenSearch.body?.data?.providers?.some((p) => p.id === providerId),
  );

  const hiddenNearby = await call("/marketplace/availability/nearby", {
    query: { ...POINT, radiusMeters: 5000, category: "plumber" },
  });
  const offlineCount = hiddenNearby.body?.data?.online ?? 0;
  check(
    "nearby count still lists them in total",
    (hiddenNearby.body?.data?.total ?? 0) > 0,
    `online=${offlineCount} total=${hiddenNearby.body?.data?.total}`,
  );

  console.log("\n→ customer request while the provider is offline");
  const request1 = await call("/marketplace/requests", {
    method: "POST",
    token: customer,
    body: {
      category: "plumber",
      description: "Kitchen tap is leaking (availability smoke test).",
      urgency: "normal",
      radiusMeters: 5000,
      ...POINT,
    },
  });
  check("request created", request1.ok, request1.body?.error ?? "");
  const requestId1 = request1.body?.data?.request?.id;

  const fanout1 = await call(`/marketplace/requests/${requestId1}/pings`, {
    method: "POST",
    token: provider ? customer : customer,
    body: { providerIds: [providerId], onlineOnly: true },
  });
  const pinged1 = fanout1.body?.data?.pingedProviderIds ?? [];
  const skipped1 = fanout1.body?.data?.skipped ?? [];
  check(
    "an offline provider receives no ping",
    !pinged1.includes(providerId),
    `skipped: ${skipped1.map((s) => s.reason).join(", ") || "none"}`,
  );
  check(
    "the fan-out says why",
    skipped1.some((s) => s.providerId === providerId && s.reason === "provider_offline"),
  );

  // --- Online ----------------------------------------------------------------

  console.log("\n→ going online");
  const online = await call("/marketplace/providers/me/availability", {
    method: "PUT",
    token: provider,
    body: { status: "online", ...POINT },
  });
  check(
    "status is online and discoverable",
    online.body?.data?.availability?.status === "online" &&
      online.body?.data?.availability?.isDiscoverable === true,
  );
  check(
    "a shift opened",
    Boolean(online.body?.data?.availability?.wentOnlineAt),
    online.body?.data?.availability?.wentOnlineAt ?? "null",
  );

  const visibleSearch = await call("/marketplace/providers", {
    query: { ...POINT, radiusMeters: 5000, category: "plumber", onlineOnly: true },
  });
  check(
    "online provider appears in an online-only search",
    Boolean(visibleSearch.body?.data?.providers?.some((p) => p.id === providerId)),
  );

  const visibleNearby = await call("/marketplace/availability/nearby", {
    query: { ...POINT, radiusMeters: 5000, category: "plumber" },
  });
  check(
    "nearby online count went up",
    (visibleNearby.body?.data?.online ?? 0) > offlineCount,
    `${offlineCount} → ${visibleNearby.body?.data?.online}`,
  );

  console.log("\n→ idempotence");
  const again = await call("/marketplace/providers/me/availability", {
    method: "PUT",
    token: provider,
    body: { status: "online", ...POINT },
  });
  check(
    "re-sending online does not restart the shift",
    again.body?.data?.availability?.wentOnlineAt ===
      online.body?.data?.availability?.wentOnlineAt,
  );

  console.log("\n→ customer request while the provider is online");
  const request2 = await call("/marketplace/requests", {
    method: "POST",
    token: customer,
    body: {
      category: "plumber",
      description: "Kitchen tap is still leaking (availability smoke test).",
      urgency: "high",
      radiusMeters: 5000,
      ...POINT,
    },
  });
  const requestId2 = request2.body?.data?.request?.id;

  const fanout2 = await call(`/marketplace/requests/${requestId2}/pings`, {
    method: "POST",
    token: customer,
    body: { providerIds: [providerId], onlineOnly: true },
  });
  const pinged2 = fanout2.body?.data?.pingedProviderIds ?? [];
  check("an online provider is pinged", pinged2.includes(providerId));
  const pingId = fanout2.body?.data?.pings?.[0]?.id;

  // --- Dashboard -------------------------------------------------------------

  console.log("\n→ dashboard");
  const dashboard = await call("/marketplace/providers/me/dashboard", {
    token: provider,
  });
  check("dashboard loads", dashboard.ok, dashboard.body?.error ?? "");
  const data = dashboard.body?.data;
  check(
    "the new ping is in the inbox",
    Boolean(data?.inbox?.some((p) => p.id === pingId)),
    `inbox=${data?.inbox?.length ?? 0}`,
  );
  check("stats are present", typeof data?.stats?.pingsReceivedToday === "number");
  check(
    "demand sees the open request",
    (data?.demand?.openRequests ?? 0) > 0,
    `open=${data?.demand?.openRequests} rivals=${data?.demand?.competingProviders}`,
  );
  check(
    "online time is accumulating",
    (data?.stats?.onlineSecondsToday ?? -1) >= 0,
    `${data?.stats?.onlineSecondsToday}s`,
  );

  // --- Busy ------------------------------------------------------------------

  console.log("\n→ accepting the job");
  const accepted = await call(`/marketplace/pings/${pingId}/respond`, {
    method: "POST",
    token: provider,
    body: { action: "accepted" },
  });
  check("ping accepted", accepted.ok, accepted.body?.error ?? "");

  const afterAccept = await call("/marketplace/providers/me/availability", {
    token: provider,
  });
  check(
    "accepting a job switches the provider to busy",
    afterAccept.body?.data?.availability?.status === "busy",
    afterAccept.body?.data?.availability?.status,
  );
  check(
    "a busy provider is no longer discoverable",
    afterAccept.body?.data?.availability?.isDiscoverable === false,
  );

  const busySearch = await call("/marketplace/providers", {
    query: { ...POINT, radiusMeters: 5000, category: "plumber", onlineOnly: true },
  });
  check(
    "a busy provider drops out of an online-only search",
    !busySearch.body?.data?.providers?.some((p) => p.id === providerId),
  );

  // --- Heartbeat -------------------------------------------------------------

  console.log("\n→ heartbeat");
  const beat = await call("/marketplace/providers/me/heartbeat", {
    method: "POST",
    token: provider,
    body: {},
  });
  check("heartbeat accepted", beat.ok, beat.body?.error ?? "");
  check(
    "heartbeat cannot change the status",
    beat.body?.data?.availability?.status === "busy",
  );

  console.log("\n→ back offline (cleanup)");
  await call("/marketplace/providers/me/availability", {
    method: "PUT",
    token: provider,
    body: { status: "offline" },
  });

  console.log(
    failures === 0
      ? "\nAll availability checks passed."
      : `\n${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nsmoke run failed:", err);
  process.exit(1);
});
