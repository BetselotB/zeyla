/**
 * Smoke test: a ping reaches an online provider's socket, and an offline one
 * hears nothing.
 *
 * The REST suite (availability.mjs) proves the database says the right thing.
 * This proves the provider's screen finds out, which is the part a customer
 * waiting for an answer actually depends on.
 *
 *   node smoke/availability-realtime.mjs
 */

import { io } from "socket.io-client";

const ORIGIN = process.env.API_URL ?? "http://localhost:4000";
const API = `${ORIGIN}/api`;

const PROVIDER_PHONE = "0911777001";
const CUSTOMER_PHONE = "0911777002";
const POINT = { lat: 8.9944, lng: 38.7889 };
const WAIT_MS = 4_000;

let failures = 0;

function check(label, condition, detail) {
  console.log(`${condition ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function call(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json().catch(() => null)) ?? {};
}

async function signIn(phone) {
  const requested = await call("/auth/otp/request", { method: "POST", body: { phone } });
  const code = requested.data?.devCode;
  if (!code) throw new Error(`no dev code for ${phone} — is AUTH_OTP_PROVIDER=mock?`);
  const verified = await call("/auth/otp/verify", {
    method: "POST",
    body: { phone, code },
  });
  return verified.data.token;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(ORIGIN, { auth: { token }, transports: ["websocket"] });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

/** Ping the provider for a fresh request, and report what the socket saw. */
async function pingRound(customer, providerId, socket, description) {
  const received = [];
  const onPing = (payload) => received.push(payload);
  socket.on("ping:incoming", onPing);

  const created = await call("/marketplace/requests", {
    method: "POST",
    token: customer,
    body: {
      category: "plumber",
      description,
      urgency: "normal",
      radiusMeters: 5000,
      ...POINT,
    },
  });
  const requestId = created.data.request.id;

  const fanout = await call(`/marketplace/requests/${requestId}/pings`, {
    method: "POST",
    token: customer,
    body: { providerIds: [providerId], onlineOnly: true },
  });

  await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
  socket.off("ping:incoming", onPing);

  return { received, fanout: fanout.data, requestId };
}

async function main() {
  console.log("→ signing in");
  const provider = await signIn(PROVIDER_PHONE);
  const customer = await signIn(CUSTOMER_PHONE);

  const me = await call("/marketplace/providers/me", { token: provider });
  const providerId = me.data?.provider?.providerId;
  if (!providerId) throw new Error("run smoke/availability.mjs first to seed the profile");

  console.log("→ opening the provider socket");
  const socket = await connect(provider);
  check("provider socket connected", socket.connected);

  // --- Offline ---------------------------------------------------------------

  console.log("\n→ offline");
  await call("/marketplace/providers/me/availability", {
    method: "PUT",
    token: provider,
    body: { status: "offline" },
  });

  const off = await pingRound(
    customer,
    providerId,
    socket,
    "Realtime smoke test — provider offline.",
  );
  check(
    "an offline provider's socket receives nothing",
    off.received.length === 0,
    `${off.received.length} event(s)`,
  );
  check(
    "the fan-out skipped them as offline",
    off.fanout?.skipped?.some((s) => s.reason === "provider_offline"),
  );

  // --- Online ----------------------------------------------------------------

  console.log("\n→ online");
  await call("/marketplace/providers/me/availability", {
    method: "PUT",
    token: provider,
    body: { status: "online", ...POINT },
  });

  const on = await pingRound(
    customer,
    providerId,
    socket,
    "Realtime smoke test — provider online.",
  );
  check(
    "an online provider's socket receives the ping",
    on.received.length === 1,
    `${on.received.length} event(s)`,
  );

  const ping = on.received[0];
  check("the event carries the request", Boolean(ping?.request?.id === on.requestId));
  check("the event carries a distance", typeof ping?.distanceMeters === "number");
  check("the event carries an expiry", Boolean(ping?.expiresAt));
  check(
    "the event carries the customer's name field",
    ping !== undefined && "customerName" in ping,
  );

  // --- Presence broadcast ----------------------------------------------------

  console.log("\n→ presence broadcast");
  const presence = [];
  socket.on("presence:changed", (payload) => presence.push(payload));

  await call("/marketplace/providers/me/availability", {
    method: "PUT",
    token: provider,
    body: { status: "offline" },
  });
  await new Promise((resolve) => setTimeout(resolve, 1_500));

  const offlineEvents = presence.filter((p) => p.status === "offline" && p.isOnline === false);
  check(
    "going offline is broadcast to the provider's other tabs",
    offlineEvents.length > 0,
    JSON.stringify(presence.map((p) => p.status)),
  );
  // A socket sits in both the provider room and the user room, so a naive
  // emit-to-each delivers the same change twice and the UI flickers.
  check(
    "the broadcast arrives exactly once per socket",
    offlineEvents.length === 1,
    `${offlineEvents.length} copies`,
  );

  socket.disconnect();

  console.log(
    failures === 0
      ? "\nAll realtime availability checks passed."
      : `\n${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nsmoke run failed:", err);
  process.exit(1);
});
