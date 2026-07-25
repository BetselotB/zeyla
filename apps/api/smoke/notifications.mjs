import { io } from "socket.io-client";
import { login, makeApi, PHONES } from "./auth.mjs";

const PORT = process.env.ZEYLA_PORT ?? "4000";
const API = `http://localhost:${PORT}/api`;
const WS = `http://localhost:${PORT}`;

let failures = 0;
const check = (label, cond, detail) => {
  if (!cond) failures++;
  console.log(
    `${cond ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
};

const api = makeApi(API);

const connect = (token) =>
  new Promise((resolve, reject) => {
    const s = io(WS, { auth: { token }, transports: ["websocket"] });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
    setTimeout(() => reject(new Error("connect timeout")), 5000);
  });

const waitFor = (socket, event, ms = 6000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (p) => {
      clearTimeout(t);
      resolve(p);
    });
  });

const sockets = [];
try {
  const customerToken = await login(API, PHONES.customer);
  const abebeToken = await login(API, PHONES.abebe);

  const provider = await connect(abebeToken);
  const customer = await connect(customerToken);
  sockets.push(provider, customer);

  const anon = await api("GET", "/notifications");
  check("feed needs identity", anon.status === 401, anon.json.error);

  const before = (await api("GET", "/notifications", { token: abebeToken })).json
    .data;

  const live = waitFor(provider, "notification:new");
  const created = await api("POST", "/marketplace/requests", {
    token: customerToken,
    body: {
      category: "plumber",
      description: "Blocked drain",
      urgency: "high",
      lat: 8.995,
      lng: 38.787,
      addressLabel: "Bole",
    },
  });
  await api("POST", `/marketplace/requests/${created.json.data.request.id}/pings`, {
    token: customerToken,
    body: { maxProviders: 3 },
  });

  const pushed = await live;
  check("provider gets notification:new over the socket", pushed.type === "ping_received", {
    title: pushed.title,
    body: pushed.body,
  });
  check(
    "notification deep-links to the request",
    pushed.data.requestId === created.json.data.request.id,
  );

  const after = (await api("GET", "/notifications", { token: abebeToken })).json
    .data;
  check(
    "feed grew by one",
    after.notifications.length === before.notifications.length + 1,
    { before: before.notifications.length, after: after.notifications.length },
  );
  check(
    "unread count tracks the feed",
    after.unreadCount === before.unreadCount + 1,
    after.unreadCount,
  );

  const read = await api("POST", `/notifications/${pushed.id}/read`, {
    token: abebeToken,
  });
  check(
    "marking read works",
    read.status === 200 && read.json.data.notification.readAt !== null,
  );

  const foreign = await api("POST", `/notifications/${pushed.id}/read`, {
    token: customerToken,
  });
  check(
    "cannot read someone else's notification",
    foreign.status === 404,
    foreign.json.error,
  );

  const unreadOnly = await api("GET", "/notifications?unreadOnly=true", {
    token: abebeToken,
  });
  check(
    "unreadOnly filter excludes the read one",
    !unreadOnly.json.data.notifications.some((n) => n.id === pushed.id),
  );

  const all = await api("POST", "/notifications/read-all", { token: abebeToken });
  check("read-all clears the badge", all.status === 200, all.json.data);
  const cleared = (await api("GET", "/notifications", { token: abebeToken })).json
    .data;
  check("unread count is zero afterwards", cleared.unreadCount === 0, cleared.unreadCount);

  const inbox = await api("GET", "/marketplace/pings?status=sent", {
    token: abebeToken,
  });
  const ping = inbox.json.data.pings[0];
  const custNote = waitFor(customer, "notification:new");
  await api("POST", `/marketplace/pings/${ping.id}/respond`, {
    token: abebeToken,
    body: { action: "accepted" },
  });
  const note = await custNote;
  check("customer is notified when a provider accepts", note.type === "ping_accepted", {
    title: note.title,
  });

  const push = await api("POST", "/notifications/devices", {
    token: customerToken,
    body: { token: "x" },
  });
  check(
    "web push is an honest 501, not a silent no-op",
    push.status === 501,
    push.json.error,
  );
} catch (err) {
  failures++;
  console.log("FAIL  threw:", err.message);
} finally {
  for (const s of sockets) s.close();
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
