import { io } from "socket.io-client";

const PORT = process.env.ZEYLA_PORT ?? "4000";
const API = `http://localhost:${PORT}/api`;
const WS = `http://localhost:${PORT}`;
const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "11111111-1111-4111-8111-111111111112";
const ABEBE = "22222222-2222-4222-8222-222222222201";
const HANNA = "22222222-2222-4222-8222-222222222206";
const CONTRACT = "33333333-3333-4333-8333-333333333390";

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`);
}

async function api(method, path, { actor, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(actor ? { "x-user-id": actor } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

function connect(userId, role) {
  return new Promise((resolve, reject) => {
    const socket = io(WS, { auth: { userId, role }, transports: ["websocket"] });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
    setTimeout(() => reject(new Error("connect timeout")), 5000);
  });
}

function waitFor(socket, event, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (p) => { clearTimeout(timer); resolve(p); });
  });
}

const sockets = [];
try {
  const provider = await connect(ABEBE, "provider");
  const customer = await connect(CUSTOMER, "user");
  const outsider = await connect(OUTSIDER, "user");
  sockets.push(provider, customer, outsider);

  // --- contract room membership --------------------------------------------
  const outsiderError = waitFor(outsider, "realtime:error");
  outsider.emit("join:contract", { contractId: CONTRACT });
  const denied = await outsiderError;
  check("outsider cannot join the contract room", denied.message === "contract_not_found", denied);

  customer.emit("join:contract", { contractId: CONTRACT });
  await new Promise((r) => setTimeout(r, 300));

  // --- provider GPS tick over the socket ------------------------------------
  const fix = waitFor(customer, "contract:location");
  provider.emit("provider:location", {
    contractId: CONTRACT, lat: 8.9975, lng: 38.7885, headingDegrees: 210, speedMps: 6.5, accuracyMeters: 9,
  });
  const got = await fix;
  check("customer receives contract:location", got.contractId === CONTRACT, {
    lat: got.lat, lng: got.lng, heading: got.headingDegrees,
  });
  check("location names the provider", got.providerId === ABEBE);

  // --- outsider must not receive it ----------------------------------------
  let leaked = false;
  outsider.on("contract:location", () => { leaked = true; });
  provider.emit("provider:location", { contractId: CONTRACT, lat: 8.9970, lng: 38.7880 });
  await new Promise((r) => setTimeout(r, 500));
  check("outsider receives no location frames", !leaked);

  // --- REST fallback --------------------------------------------------------
  const cached = await api("GET", `/realtime/contracts/${CONTRACT}/location`, { actor: CUSTOMER });
  check("REST fallback serves the cached fix", cached.status === 200, {
    age: cached.json.data?.location?.ageSeconds, watchers: cached.json.data?.watchers,
  });
  check("cached fix matches the last tick", cached.json.data.location.lat === 8.997);

  const stranger = await api("GET", `/realtime/contracts/${CONTRACT}/location`, { actor: OUTSIDER });
  check("stranger cannot read the location", stranger.status === 404, stranger.json.error);

  // --- only the provider may post -------------------------------------------
  const spoof = await api("POST", `/realtime/contracts/${CONTRACT}/location`, {
    actor: HANNA, body: { lat: 9.0, lng: 38.8 },
  });
  check("non-party cannot post location", spoof.status === 404, spoof.json.error);

  const customerPost = await api("POST", `/realtime/contracts/${CONTRACT}/location`, {
    actor: CUSTOMER, body: { lat: 9.0, lng: 38.8 },
  });
  check("customer on the contract still cannot post location", customerPost.status === 403, customerPost.json.error);

  const badFix = await api("POST", `/realtime/contracts/${CONTRACT}/location`, {
    actor: ABEBE, body: { lat: 500, lng: 38.8 },
  });
  check("out-of-range latitude rejected", badFix.status === 400, badFix.json.error);

  // --- REST post reaches the socket room ------------------------------------
  const viaRest = waitFor(customer, "contract:location");
  const posted = await api("POST", `/realtime/contracts/${CONTRACT}/location`, {
    actor: ABEBE, body: { lat: 8.9960, lng: 38.7875 },
  });
  check("provider REST post accepted", posted.status === 200, posted.json.error ?? posted.status);
  const restFix = await viaRest;
  check("REST post broadcasts to the room", restFix.lat === 8.996);

  // --- demo route simulation ------------------------------------------------
  const frames = [];
  customer.on("contract:location", (f) => frames.push(f));
  const sim = await api("POST", `/realtime/contracts/${CONTRACT}/simulate`, {
    actor: CUSTOMER, body: { steps: 4, intervalMs: 300 },
  });
  check("simulation starts", sim.status === 200, sim.json.data ?? sim.json.error);
  await new Promise((r) => setTimeout(r, 1800));
  check("simulation streamed frames", frames.length >= 4, frames.length);
  const last = frames.at(-1);
  check("simulation arrives at the job", Math.abs(last.lat - 8.995) < 1e-6 && Math.abs(last.lng - 38.787) < 1e-6, last && { lat: last.lat, lng: last.lng });

  // --- TTL is short ----------------------------------------------------------
  const status = await api("GET", "/realtime/status");
  check("status advertises the TTL", status.json.data.locationTtlSeconds === 30, status.json.data.locationTtlSeconds);
} catch (err) {
  failures++;
  console.log("FAIL  threw:", err.message);
} finally {
  for (const s of sockets) s.close();
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
