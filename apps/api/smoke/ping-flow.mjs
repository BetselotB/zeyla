import { io } from "socket.io-client";
import { login, makeApi, PHONES } from "./auth.mjs";

const PORT = process.env.ZEYLA_PORT ?? "4000";
const API = `http://localhost:${PORT}/api`;
const WS = `http://localhost:${PORT}`;
const ABEBE = "22222222-2222-4222-8222-222222222201";
const HANNA = "22222222-2222-4222-8222-222222222206";
const DAWIT = "22222222-2222-4222-8222-222222222203";

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

function waitFor(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs,
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

const sockets = [];

try {
  const customerToken = await login(API, PHONES.customer);
  const abebeToken = await login(API, PHONES.abebe);
  const hannaToken = await login(API, PHONES.hanna);

  const anon = io(WS, { auth: {}, transports: ["websocket"] });
  const rejected = await new Promise((resolve) => {
    anon.on("connect_error", (e) => resolve(e.message));
    anon.on("connect", () => resolve("connected"));
    setTimeout(() => resolve("no response"), 4000);
  });
  anon.close();
  check("socket without token is rejected", rejected === "unauthenticated", rejected);

  const abebe = await connect(abebeToken);
  const hanna = await connect(hannaToken);
  const customer = await connect(customerToken);
  sockets.push(abebe, hanna, customer);
  check("provider + customer sockets connected", true);

  const online = await api(
    "GET",
    "/marketplace/providers?lat=8.9950&lng=38.7870&radiusMeters=1000&onlineOnly=true",
  );
  check(
    "connected providers show online in discovery",
    online.json.data.providers.some((p) => p.id === ABEBE),
    online.json.data.providers.map((p) => p.name),
  );

  const unauth = await api("POST", "/marketplace/requests", {
    body: { category: "plumber", lat: 8.995, lng: 38.787 },
  });
  check("request without token is 401", unauth.status === 401, unauth.json.error);

  const created = await api("POST", "/marketplace/requests", {
    token: customerToken,
    body: {
      category: "plumber",
      description: "Kitchen pipe burst, water everywhere",
      urgency: "emergency",
      lat: 8.995,
      lng: 38.787,
      addressLabel: "Bole Medhanialem, behind the church",
      radiusMeters: 3000,
    },
  });
  check("POST /requests -> 201", created.status === 201, created.status);
  const requestId = created.json.data.request.id;
  check("request starts pending", created.json.data.request.status === "pending");

  const incoming = waitFor(abebe, "ping:incoming");
  const fanout = await api("POST", `/marketplace/requests/${requestId}/pings`, {
    token: customerToken,
    body: { maxProviders: 5 },
  });
  check("POST /requests/:id/pings -> 201", fanout.status === 201, fanout.status);
  const pinged = fanout.json.data.pingedProviderIds;
  check("pinged the two online plumbers in range", pinged.length === 2, pinged);
  check("offline provider not pinged", !pinged.includes(DAWIT));
  check("request moved to pinged", fanout.json.data.request.status === "pinged");

  const event = await incoming;
  check("provider socket received ping:incoming", event.requestId === requestId);
  check(
    "ping payload carries the request + customer name",
    event.request.description.startsWith("Kitchen pipe") &&
      event.customerName === "Sara Bekele",
    {
      urgency: event.request.urgency,
      customer: event.customerName,
      distance: event.distanceMeters,
    },
  );

  const again = await api("POST", `/marketplace/requests/${requestId}/pings`, {
    token: customerToken,
    body: { maxProviders: 5 },
  });
  check(
    "second fan-out pings nobody new",
    again.json.data.pings.length === 0,
    again.json.data.pings.length,
  );

  const inbox = await api("GET", "/marketplace/pings", { token: abebeToken });
  const myPing = inbox.json.data.pings.find((p) => p.requestId === requestId);
  check("provider inbox lists the ping", Boolean(myPing), inbox.json.data.pings.length);
  check(
    "ping records distance + trust snapshot",
    myPing.distanceMeters > 0 && myPing.trustScoreAtPing !== null,
    { m: myPing.distanceMeters, trust: myPing.trustScoreAtPing },
  );

  const stolen = await api("POST", `/marketplace/pings/${myPing.id}/respond`, {
    token: hannaToken,
    body: { action: "accepted" },
  });
  check("other provider cannot answer the ping", stolen.status === 404, stolen.json.error);

  const answered = waitFor(customer, "ping:answered");
  const accept = await api("POST", `/marketplace/pings/${myPing.id}/respond`, {
    token: abebeToken,
    body: { action: "accepted" },
  });
  check("provider accepts -> 200", accept.status === 200, accept.json.error ?? accept.status);
  check("request is accepted", accept.json.data.request.status === "accepted");

  const answer = await answered;
  check("customer socket received ping:answered", answer.pingId === myPing.id, {
    provider: answer.providerName,
    status: answer.status,
  });

  const twice = await api("POST", `/marketplace/pings/${myPing.id}/respond`, {
    token: abebeToken,
    body: { action: "declined" },
  });
  check("answering twice is 409", twice.status === 409, twice.json.error);

  const view = await api("GET", `/marketplace/requests/${requestId}`, {
    token: customerToken,
  });
  check(
    "customer sees all pings on the request",
    view.json.data.pings.length === 2,
    view.json.data.pings.length,
  );

  const nosy = await api("GET", `/marketplace/requests/${requestId}`, {
    token: hannaToken,
  });
  check("stranger cannot read the request", nosy.status === 404, nosy.json.error);

  abebe.close();
  await new Promise((r) => setTimeout(r, 600));
  const afterClose = await api("GET", `/marketplace/providers/${ABEBE}`);
  check(
    "provider goes offline when the last socket drops",
    afterClose.json.data.isOnline === false,
  );
} catch (err) {
  failures++;
  console.log("FAIL  threw:", err.message);
} finally {
  for (const s of sockets) s.close();
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
