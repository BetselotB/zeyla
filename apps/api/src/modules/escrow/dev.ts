import { Router } from "express";
import { query } from "../../db/client.js";
import { env } from "../../config/env.js";
import { asyncHandler, fail, ok } from "../../lib/respond.js";
import { isChapaLive } from "./chapa.js";
import { CONSOLE_HTML, checkoutHtml } from "./console-html.js";
import { handleChapaWebhook, webhookSecret } from "./service.js";
import { signPayload } from "./signature.js";

/**
 * Demo-only routes, mounted at /api/escrow/dev and only when DEMO_MODE is on.
 *
 * These exist so the Identity & Money module can be demoed before the
 * marketplace and frontend modules land. Everything here is disposable and
 * confined to this folder — nothing in the real request path imports it.
 */
export const devRouter = Router();

devRouter.get("/console", (_req, res) => {
  res.type("html").send(CONSOLE_HTML);
});

/**
 * Minimal stand-in for the marketplace module's provider records: a contract
 * needs a row in `providers` to point at, and that table has another owner.
 * Seeds one and hands back its id. Idempotent by phone.
 */
devRouter.post(
  "/seed",
  asyncHandler(async (req, res) => {
    const phone = typeof req.body?.phone === "string" ? req.body.phone : "+251900000001";
    const name = typeof req.body?.name === "string" ? req.body.name : "Demo Provider";
    const category = typeof req.body?.category === "string" ? req.body.category : "plumbing";

    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (phone, name, role, kyc_status)
       VALUES ($1, $2, 'provider', 'verified')
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
       RETURNING id`,
      [phone, name],
    );

    const providerId = rows[0]?.id;
    if (!providerId) {
      res.status(500).json(fail("seed_failed"));
      return;
    }

    await query(
      `INSERT INTO providers (user_id, category, bio, base_lat, base_lng, location, is_online)
       VALUES ($1, $2, 'Seeded by the Identity & Money demo console.',
               9.0108, 38.7613, ST_SetSRID(ST_MakePoint(38.7613, 9.0108), 4326)::geography, true)
       ON CONFLICT (user_id) DO UPDATE SET category = EXCLUDED.category, updated_at = now()`,
      [providerId, category],
    );

    res.json(ok({ providerId, phone, name, category }));
  }),
);

/** Local replacement for Chapa's hosted checkout page. */
devRouter.get("/checkout", (req, res) => {
  if (isChapaLive()) {
    res.status(409).json(fail("chapa_is_live_use_the_real_checkout"));
    return;
  }

  res.type("html").send(
    checkoutHtml({
      txRef: String(req.query.tx_ref ?? ""),
      amount: String(req.query.amount ?? "0"),
      currency: String(req.query.currency ?? "ETB"),
      returnUrl: String(req.query.return_url ?? env.WEB_APP_URL),
    }),
  );
});

/**
 * Delivers a Chapa-shaped webhook to ourselves: builds the payload, signs it
 * with the same secret the real handler checks, and feeds it through the
 * production code path. Signature verification, idempotency and the state
 * transition are all the real ones — only the sender is local.
 *
 * Allowed even when Chapa is live, because Chapa cannot reach a laptop on
 * localhost. That is not a hole: with a live key `handleChapaWebhook` re-checks
 * the transaction against Chapa's verify endpoint, so this can only confirm a
 * payment that genuinely happened on the hosted checkout.
 */
devRouter.post(
  "/simulate-payment",
  asyncHandler(async (req, res) => {
    const txRef = typeof req.body?.txRef === "string" ? req.body.txRef : "";
    if (!txRef) {
      res.status(400).json(fail("tx_ref_required"));
      return;
    }

    const payload = {
      event: "charge.success",
      type: "API",
      status: "success",
      tx_ref: txRef,
      currency: "ETB",
      mode: "test",
      created_at: new Date().toISOString(),
    };

    const rawBody = JSON.stringify(payload);
    const secret = webhookSecret();

    const outcome = await handleChapaWebhook({
      rawBody,
      chapaSignature: signPayload(rawBody, secret),
    });

    res.json(ok(outcome));
  }),
);
