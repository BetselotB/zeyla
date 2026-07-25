/**
 * Identity & Money dev console.
 *
 * A single self-contained page for driving the auth + escrow endpoints end to
 * end without waiting on the real React app. It lives inside this module on
 * purpose: the frontend folders belong to other owners, so putting a test
 * harness there would collide on merge. Delete this file the day the real
 * onboarding and payment screens are wired up.
 *
 * The page's own JavaScript uses string concatenation rather than template
 * literals so it can sit inside this template literal without escaping.
 */
export const CONSOLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Zeyla — Identity &amp; Money console</title>
<style>
  :root {
    --bg: #0e1117; --panel: #161b22; --line: #262d38; --text: #e6edf3;
    --muted: #8b949e; --accent: #2f81f7; --ok: #3fb950; --warn: #d29922;
    --bad: #f85149; --radius: 10px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px 64px; background: var(--bg); color: var(--text);
    font: 14px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .wrap { max-width: 940px; margin: 0 auto; }
  header { margin-bottom: 8px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 24px; }
  .banner {
    background: rgba(210,153,34,.12); border: 1px solid rgba(210,153,34,.4);
    color: #e3b341; padding: 10px 14px; border-radius: var(--radius);
    margin-bottom: 24px; font-size: 13px;
  }
  .card {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 18px 20px; margin-bottom: 16px;
  }
  .card h2 {
    font-size: 13px; text-transform: uppercase; letter-spacing: .07em;
    color: var(--muted); margin: 0 0 14px; font-weight: 600;
  }
  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .row + .row { margin-top: 10px; }
  label { color: var(--muted); font-size: 12px; display: block; margin-bottom: 4px; }
  input, select {
    background: #0d1117; border: 1px solid var(--line); color: var(--text);
    padding: 8px 10px; border-radius: 7px; font: inherit; min-width: 160px;
  }
  input:focus, select:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
  button {
    background: var(--accent); color: #fff; border: 0; padding: 8px 14px;
    border-radius: 7px; font: inherit; font-weight: 500; cursor: pointer;
  }
  button.ghost { background: transparent; border: 1px solid var(--line); color: var(--text); }
  button:disabled { opacity: .4; cursor: not-allowed; }
  .pill {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 600; border: 1px solid var(--line);
  }
  .pill.awaiting_escrow { color: var(--warn); border-color: rgba(210,153,34,.5); }
  .pill.escrowed { color: var(--accent); border-color: rgba(47,129,247,.5); }
  .pill.active { color: #a371f7; border-color: rgba(163,113,247,.5); }
  .pill.completed { color: var(--ok); border-color: rgba(63,185,80,.5); }
  .pill.disputed { color: var(--bad); border-color: rgba(248,81,73,.5); }
  .kv { display: grid; grid-template-columns: 150px 1fr; gap: 6px 14px; font-size: 13px; }
  .kv dt { color: var(--muted); }
  .kv dd { margin: 0; font-variant-numeric: tabular-nums; }
  ol.timeline { list-style: none; margin: 0; padding: 0; }
  ol.timeline li {
    border-left: 2px solid var(--line); padding: 0 0 12px 14px;
    position: relative; font-size: 13px;
  }
  ol.timeline li::before {
    content: ""; position: absolute; left: -5px; top: 6px; width: 8px; height: 8px;
    border-radius: 50%; background: var(--accent);
  }
  ol.timeline .meta { color: var(--muted); font-size: 12px; }
  pre#log {
    background: #0d1117; border: 1px solid var(--line); border-radius: var(--radius);
    padding: 14px; max-height: 260px; overflow: auto; font-size: 12px;
    white-space: pre-wrap; word-break: break-word; margin: 0;
  }
  .muted { color: var(--muted); }
  .ok { color: var(--ok); } .bad { color: var(--bad); }
  a { color: var(--accent); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Zeyla — Identity &amp; Money console</h1>
    <p class="sub">Backend harness for <code>/api/auth</code> and <code>/api/escrow</code>. Owner: @betselot.</p>
  </header>

  <div class="banner">
    Demo harness, not a product screen. Provider data is seeded locally to stand in for the
    marketplace module, and KYC is stored without any biometric match.
  </div>

  <div class="card">
    <h2>1 &middot; Sign in with phone</h2>
    <div class="row">
      <div><label for="phone">Phone</label><input id="phone" value="0911223344" /></div>
      <div><label>&nbsp;</label><button id="btn-otp">Send OTP</button></div>
      <div><label for="code">Code</label><input id="code" placeholder="6 digits" /></div>
      <div><label>&nbsp;</label><button id="btn-verify">Verify &amp; sign in</button></div>
    </div>
    <div class="row"><span id="who" class="muted">Not signed in.</span></div>
  </div>

  <div class="card">
    <h2>2 &middot; Profile &amp; KYC</h2>
    <div class="row">
      <div><label for="name">Display name</label><input id="name" value="Abebe Kebede" /></div>
      <div><label for="email">Email (Chapa receipt)</label><input id="email" type="email" placeholder="you@example.com" /></div>
      <div><label for="role">Role</label>
        <select id="role"><option value="user">user</option><option value="provider">provider</option></select>
      </div>
      <div><label>&nbsp;</label><button id="btn-profile" class="ghost">Save profile</button></div>
    </div>
    <div class="row">
      <div><label for="id-doc">ID photo</label><input id="id-doc" type="file" accept="image/*" /></div>
      <div><label for="selfie">Selfie</label><input id="selfie" type="file" accept="image/*" /></div>
      <div><label>&nbsp;</label><button id="btn-kyc">Upload documents</button></div>
      <div><label>&nbsp;</label><button id="btn-kyc-fake" class="ghost">Use placeholder images</button></div>
    </div>
    <div class="row"><span id="kyc-state" class="muted">No documents submitted.</span></div>
  </div>

  <div class="card">
    <h2>3 &middot; Contract</h2>
    <div class="row">
      <div><label>&nbsp;</label><button id="btn-seed" class="ghost">Seed a demo provider</button></div>
      <div><label for="provider">Provider id</label><input id="provider" style="min-width:280px" placeholder="run seed, or paste one" /></div>
    </div>
    <div class="row">
      <div><label for="title">Job</label><input id="title" value="Fix kitchen sink" /></div>
      <div><label for="amount">Amount (ETB)</label><input id="amount" type="number" value="850" /></div>
      <div><label>&nbsp;</label><button id="btn-create">Create contract</button></div>
    </div>
  </div>

  <div class="card">
    <h2>4 &middot; Escrow</h2>
    <div class="row">
      <button id="btn-fund">Fund via Chapa</button>
      <button id="btn-confirm" class="ghost">I paid &mdash; deliver webhook</button>
      <button id="btn-start" class="ghost">Start work</button>
      <button id="btn-complete" class="ghost">Complete &amp; pay out</button>
      <button id="btn-dispute" class="ghost">Raise dispute</button>
    </div>
    <div class="row">
      <span class="muted" id="escrow-hint">Fund opens the checkout page. Chapa cannot call
      localhost, so after paying on a real hosted checkout use &ldquo;deliver webhook&rdquo; &mdash;
      it is still verified against Chapa before any funds are marked held.</span>
    </div>
    <div class="row">
      <div><label for="admin-key">x-admin-key</label><input id="admin-key" placeholder="ADMIN_API_KEY" /></div>
      <div><label>&nbsp;</label><button id="btn-release" class="ghost">Admin force-release</button></div>
      <div><label>&nbsp;</label><button id="btn-refund" class="ghost">Admin refund</button></div>
    </div>
  </div>

  <div class="card">
    <h2>Contract state</h2>
    <div id="contract-state" class="muted">No contract yet.</div>
  </div>

  <div class="card">
    <h2>Transition history</h2>
    <ol class="timeline" id="timeline"><li class="muted">Nothing recorded yet.</li></ol>
  </div>

  <div class="card">
    <h2>Request log</h2>
    <pre id="log">ready.</pre>
  </div>
</div>

<script>
(function () {
  var token = null, contractId = null, lastTxRef = null;
  var $ = function (id) { return document.getElementById(id); };

  function log(label, payload) {
    var pre = $("log");
    var stamp = new Date().toLocaleTimeString();
    var body = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    pre.textContent = "[" + stamp + "] " + label + "\\n" + body + "\\n\\n" + pre.textContent;
  }

  function api(method, path, body, extraHeaders) {
    var headers = { "content-type": "application/json" };
    if (token) headers.authorization = "Bearer " + token;
    if (extraHeaders) Object.keys(extraHeaders).forEach(function (k) {
      if (extraHeaders[k]) headers[k] = extraHeaders[k];
    });

    return fetch(path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return { success: false, error: "bad_json" }; })
        .then(function (json) {
          log(method + " " + path + " -> " + res.status, json);
          if (!json.success) throw new Error(json.error || "request_failed");
          return json.data;
        });
    });
  }

  function fileToBase64(input) {
    var file = input.files && input.files[0];
    if (!file) return Promise.resolve(null);
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 1x1 png, enough to prove the upload path works without a camera.
  var PLACEHOLDER =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  function renderKyc(kyc) {
    var el = $("kyc-state");
    if (!kyc || !kyc.submittedAt) { el.textContent = "No documents submitted."; return; }
    var note = kyc.autoVerified
      ? " (auto-verified for the demo — no biometric match ran)"
      : "";
    el.innerHTML = 'Status: <span class="pill">' + kyc.kycStatus + "</span> " +
      '<span class="muted">submitted ' + new Date(kyc.submittedAt).toLocaleTimeString() +
      note + "</span>";
  }

  function renderContract(contract) {
    if (!contract) return;
    contractId = contract.id;
    var ledger = contract.ledger;
    var rows =
      "<dt>Contract</dt><dd>" + contract.id + "</dd>" +
      "<dt>Status</dt><dd><span class='pill " + contract.status + "'>" + contract.status + "</span></dd>" +
      "<dt>Job</dt><dd>" + (contract.title || "—") + "</dd>" +
      "<dt>Amount</dt><dd>" + contract.agreedAmount + " " + contract.currency + "</dd>";
    if (ledger) {
      rows +=
        "<dt>Ledger</dt><dd>" + ledger.status + "</dd>" +
        "<dt>Platform fee</dt><dd>" + ledger.platformFee + " " + ledger.currency + "</dd>" +
        "<dt>Provider payout</dt><dd>" +
          (ledger.providerPayout === null ? "—" : ledger.providerPayout + " " + ledger.currency) + "</dd>" +
        "<dt>Chapa tx_ref</dt><dd>" + (ledger.chapaTxRef || "—") + "</dd>" +
        "<dt>Transfer ref</dt><dd>" + (ledger.chapaTransferRef || "—") + "</dd>";
    }
    $("contract-state").innerHTML = "<dl class='kv'>" + rows + "</dl>";
  }

  function refresh() {
    if (!contractId) return Promise.resolve();
    return api("GET", "/api/escrow/contracts/" + contractId)
      .then(function (contract) {
        renderContract(contract);
        return api("GET", "/api/escrow/contracts/" + contractId + "/events");
      })
      .then(function (events) {
        $("timeline").innerHTML = events.map(function (e) {
          return "<li><strong>" + (e.fromStatus || "new") + " &rarr; " + e.toStatus + "</strong>" +
            "<div class='meta'>" + e.actor + (e.reason ? " · " + e.reason : "") +
            " · " + new Date(e.createdAt).toLocaleTimeString() + "</div></li>";
        }).join("") || "<li class='muted'>Nothing recorded yet.</li>";
      })
      .catch(function (err) { log("refresh failed", err.message); });
  }

  function guard(fn) {
    return function () {
      try { var out = fn(); if (out && out.catch) out.catch(function (e) { log("error", e.message); }); }
      catch (e) { log("error", e.message); }
    };
  }

  $("btn-otp").onclick = guard(function () {
    return api("POST", "/api/auth/otp/request", { phone: $("phone").value })
      .then(function (data) { if (data.devCode) $("code").value = data.devCode; });
  });

  $("btn-verify").onclick = guard(function () {
    return api("POST", "/api/auth/otp/verify", { phone: $("phone").value, code: $("code").value })
      .then(function (data) {
        token = data.token;
        $("who").innerHTML = "Signed in as <strong>" + data.user.phone + "</strong> " +
          "<span class='muted'>(" + data.user.id + ")</span>";
        if (data.user.name) $("name").value = data.user.name;
        if (data.user.email) $("email").value = data.user.email;
        return api("GET", "/api/auth/kyc/status").then(renderKyc);
      });
  });

  $("btn-profile").onclick = guard(function () {
    var body = { name: $("name").value, role: $("role").value };
    if ($("email").value.trim()) body.email = $("email").value.trim();
    return api("PATCH", "/api/auth/me", body);
  });

  function uploadKyc(idDoc, selfie) {
    return api("POST", "/api/auth/kyc/upload", { idDocBase64: idDoc, selfieBase64: selfie })
      .then(renderKyc);
  }

  $("btn-kyc").onclick = guard(function () {
    return Promise.all([fileToBase64($("id-doc")), fileToBase64($("selfie"))])
      .then(function (files) {
        if (!files[0] || !files[1]) throw new Error("pick both an ID photo and a selfie");
        return uploadKyc(files[0], files[1]);
      });
  });

  $("btn-kyc-fake").onclick = guard(function () {
    return uploadKyc(PLACEHOLDER, PLACEHOLDER);
  });

  $("btn-seed").onclick = guard(function () {
    return api("POST", "/api/escrow/dev/seed", {}).then(function (data) {
      $("provider").value = data.providerId;
    });
  });

  $("btn-create").onclick = guard(function () {
    return api("POST", "/api/escrow/contracts", {
      providerId: $("provider").value.trim(),
      agreedAmount: Number($("amount").value),
      title: $("title").value
    }).then(function (contract) { renderContract(contract); return refresh(); });
  });

  $("btn-fund").onclick = guard(function () {
    if (!contractId) throw new Error("create a contract first");
    return api("POST", "/api/escrow/contracts/" + contractId + "/fund", {})
      .then(function (data) {
        lastTxRef = data.txRef;
        window.open(data.checkoutUrl, "_blank", "noopener");
        log("checkout opened", data.simulated
          ? "Simulated Chapa page — paying there posts a signed webhook back."
          : "Live Chapa hosted checkout. Pay there, then click \\u201cI paid\\u201d to deliver the webhook locally.");
      });
  });

  $("btn-confirm").onclick = guard(function () {
    if (!lastTxRef) throw new Error("fund the contract first");
    return api("POST", "/api/escrow/dev/simulate-payment", { txRef: lastTxRef })
      .then(refresh);
  });

  function transition(path, body) {
    return function () {
      if (!contractId) { log("error", "create a contract first"); return; }
      api("POST", "/api/escrow/contracts/" + contractId + path, body || {})
        .then(refresh)
        .catch(function (e) { log("error", e.message); });
    };
  }

  $("btn-start").onclick = transition("/start", { reason: "provider arrived" });
  $("btn-complete").onclick = transition("/complete", { reason: "customer confirmed" });
  $("btn-dispute").onclick = transition("/dispute", { reason: "raised from console" });

  function adminAction(path) {
    return function () {
      if (!contractId) { log("error", "create a contract first"); return; }
      api("POST", "/api/escrow/admin/contracts/" + contractId + path, {},
        { "x-admin-key": $("admin-key").value })
        .then(refresh)
        .catch(function (e) { log("error", e.message); });
    };
  }

  $("btn-release").onclick = adminAction("/force-release");
  $("btn-refund").onclick = adminAction("/refund");

  // The simulated checkout tab posts back here once payment is confirmed.
  window.addEventListener("message", function (event) {
    if (event.data && event.data.zeylaPaid) { log("webhook delivered", event.data); refresh(); }
  });
  setInterval(function () { if (contractId && token) refresh(); }, 5000);
})();
</script>
</body>
</html>`;

/** Stand-in for Chapa's hosted checkout page, used when no Chapa key is set. */
export function checkoutHtml(params: {
  txRef: string;
  amount: string;
  currency: string;
  returnUrl: string;
}): string {
  const esc = (value: string) =>
    value.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
    );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Simulated Chapa checkout</title>
<style>
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f4f6fa; color: #10203a;
    font: 15px/1.6 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .card {
    background: #fff; border-radius: 14px; padding: 32px; width: min(420px, 92vw);
    box-shadow: 0 12px 40px rgba(16,32,58,.12); text-align: center;
  }
  .tag {
    display: inline-block; background: #fff4d6; color: #8a6100; font-size: 12px;
    font-weight: 600; padding: 4px 10px; border-radius: 999px; margin-bottom: 18px;
  }
  h1 { font-size: 17px; margin: 0 0 4px; }
  .amount { font-size: 34px; font-weight: 700; margin: 14px 0 2px; }
  .ref { color: #6b7a90; font-size: 12px; word-break: break-all; margin-bottom: 24px; }
  button {
    width: 100%; padding: 13px; border: 0; border-radius: 9px; font: inherit;
    font-weight: 600; cursor: pointer; background: #17b26a; color: #fff;
  }
  button.cancel { background: transparent; color: #6b7a90; margin-top: 8px; font-weight: 500; }
  #status { margin-top: 16px; font-size: 13px; min-height: 20px; }
</style>
</head>
<body>
<div class="card">
  <span class="tag">SIMULATED — no real money</span>
  <h1>Fund Zeyla escrow</h1>
  <div class="amount">${esc(params.amount)} ${esc(params.currency)}</div>
  <div class="ref">${esc(params.txRef)}</div>
  <button id="pay">Pay now</button>
  <button class="cancel" id="cancel">Cancel</button>
  <div id="status"></div>
</div>
<script>
(function () {
  var txRef = ${JSON.stringify(params.txRef)};
  var returnUrl = ${JSON.stringify(params.returnUrl)};

  document.getElementById("cancel").onclick = function () { window.close(); };
  document.getElementById("pay").onclick = function () {
    var btn = this;
    btn.disabled = true;
    document.getElementById("status").textContent = "Confirming with Zeyla...";

    fetch("/api/escrow/dev/simulate-payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txRef: txRef })
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json.success) throw new Error(json.error || "failed");
        document.getElementById("status").textContent = "Paid. Funds are held in escrow.";
        if (window.opener) window.opener.postMessage({ zeylaPaid: true, txRef: txRef }, "*");
        setTimeout(function () { window.location.href = returnUrl; }, 900);
      })
      .catch(function (err) {
        btn.disabled = false;
        document.getElementById("status").textContent = "Failed: " + err.message;
      });
  };
})();
</script>
</body>
</html>`;
}
