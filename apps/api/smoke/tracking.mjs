import { io } from "socket.io-client";
import { login, makeApi, PHONES } from "./auth.mjs";

const PORT = process.env.ZEYLA_PORT ?? "4000";
const API = `http://localhost:${PORT}/api`;
const WS = `http://localhost:${PORT}`;
const ABEBE = "22222222-2222-4222-8222-222222222201";
const CONTRACT = "33333333-3333-4333-8333-333333333390";

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(
    `${condition ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
}

const api = makeApi(API);

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(WS, { auth: { token }, transports: ["websocket"] });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
    setTimeout(() => reject(new Error("connect timeout")), 5000);
  });
}

function waitFor(socket, event, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs,
    );
    socket.once(event, (p) => {
      clearTimeout(timer);
      resolve(p);
    });
  });
}

const sockets = [];
try {
  const customerToken = await login(API, PHONES.customer);
  const outsiderToken = await login(API, PHONES.yonas);
  const abebeToken = await login(API, PHONES.abebe);
  const hannaToken = await login(API, PHONES.hanna);

  const provider = await connect(abebeToken);
  const customer = await connect(customerToken);
  const outsider = await connect(outsiderToken);
  sockets.push(provider, customer, outsider);

  const outsiderError = waitFor(outsider, "realtime:error");
  outsider.emit("join:contract", { contractId: CONTRACT });
  const denied = await outsiderError;
  check(
    "outsider cannot join the contract room",
    denied.message === "contract_not_found",
    denied,
  );

  customer.emit("join:contract", { contractId: CONTRACT });
  await new Promise((r) => setTimeout(r, 300));

  const fix = waitFor(customer, "contract:location");
  provider.emit("provider:location", {
    contractId: CONTRACT,
    lat: 8.9975,
    lng: 38.7885,
    headingDegrees: 210,
    speedMps: 6.5,
    accuracyMeters: 9,
  });
  const got = await fix;
  check("customer receives contract:location", got.contractId === CONTRACT, {
    lat: got.lat,
    lng: got.lng,
    heading: got.headingDegrees,
  });
  check("location names the provider", got.providerId === ABEBE);

  let leaked = false;
  outsider.on("contract:location", () => {
    leaked = true;
  });
  provider.emit("provider:location", {
    contractId: CONTRACT,
    lat: 8.9970,
    lng: 38.7880,
  });
  await new Promise((r) => setTimeout(r, 500));
  check("outsider receives no location frames", !leaked);

  const cached = await api("GET", `/realtime/contracts/${CONTRACT}/location`, {
    token: customerToken,
  });
  check("REST fallback serves the cached fix", cached.status === 200, {
    age: cached.json.data?.location?.ageSeconds,
    watchers: cached.json.data?.watchers,
  });
  check("cached fix matches the last tick", cached.json.data.location.lat === 8.997);

  const stranger = await api("GET", `/realtime/contracts/${CONTRACT}/location`, {
    token: outsiderToken,
  });
  check("stranger cannot read the location", stranger.status === 404, stranger.json.error);

  const spoof = await api("POST", `/realtime/contracts/${CONTRACT}/location`, {
    token: hannaToken,
    body: { lat: 9.0, lng: 38.8 },
  });
  check("non-party cannot post location", spoof.status === 404, spoof.json.error);

  const customerPost = await api("POST", `/realtime/contracts/${CONTRACT}/location`, {
    token: customerToken,
    body: { lat: 9.0, lng: 38.8 },
  });
  check(
    "customer on the contract still cannot post location",
    customerPost.status === 403,
    customerPost.json.error,
  );

  const badFix = await api("POST", `/realtime/contracts/${CONTRACT}/location`, {
    token: abebeToken,
    body: { lat: 500, lng: 38.8 },
  });
  check("out-of-range latitude rejected", badFix.status === 400, badFix.json.error);

  const viaRest = waitFor(customer, "contract:location");
  const posted = await api("POST", `/realtime/contracts/${CONTRACT}/location`, {
    token: abebeToken,
    body: { lat: 8.9960, lng: 38.7875 },
  });
  check("provider REST post accepted", posted.status === 200, posted.json.error ?? posted.status);
  const restFix = await viaRest;
  check("REST post broadcasts to the room", restFix.lat === 8.996);

  const frames = [];
  customer.on("contract:location", (f) => frames.push(f));
  const sim = await api("POST", `/realtime/contracts/${CONTRACT}/simulate`, {
    token: customerToken,
    body: { steps: 4, intervalMs: 300 },
  });
  check("simulation starts", sim.status === 200, sim.json.data ?? sim.json.error);
  await new Promise((r) => setTimeout(r, 1800));
  check("simulation streamed frames", frames.length >= 4, frames.length);
  const last = frames.at(-1);
  check(
    "simulation arrives at the job",
    Math.abs(last.lat - 8.995) < 1e-6 && Math.abs(last.lng - 38.787) < 1e-6,
    last && { lat: last.lat, lng: last.lng },
  );

  const status = await api("GET", "/realtime/status");
  check(
    "status advertises the TTL",
    status.json.data.locationTtlSeconds === 30,
    status.json.data.locationTtlSeconds,
  );
  check(
    "status documents token handshake + contract events",
    status.json.data.handshake?.auth?.token?.includes("Bearer") &&
      status.json.data.events.serverToClient.includes("contract:status"),
    status.json.data.handshake,
  );
} catch (err) {
  failures++;
  console.log("FAIL  threw:", err.message);
} finally {
  for (const s of sockets) s.close();
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
