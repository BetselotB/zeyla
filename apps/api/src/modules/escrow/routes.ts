import { Router, type Response } from "express";
import { env } from "../../config/env.js";
import { pathParam } from "../../lib/params.js";
import { asyncHandler, fail, ok } from "../../lib/respond.js";
import { authedUser, requireAdmin, requireAuth } from "../auth/middleware.js";
import { ChapaError, isChapaLive } from "./chapa.js";
import { devRouter } from "./dev.js";
import * as service from "./service.js";
import { EscrowError } from "./service.js";
import { InvalidTransitionError, TRANSITIONS } from "./state-machine.js";

/**
 * Escrow — contract state machine and Chapa money movement.
 * Owner: @betselot. Response shapes live in @zeyla/shared/identity-money.ts.
 */
export const escrowRouter = Router();

function sendError(res: Response, err: unknown): void {
  if (
    err instanceof EscrowError ||
    err instanceof ChapaError ||
    err instanceof InvalidTransitionError
  ) {
    res.status(err.status).json(fail(err.message));
    return;
  }
  throw err;
}

escrowRouter.get("/state-machine", (_req, res) => {
  res.json(
    ok({
      demoMode: env.DEMO_MODE,
      chapaConfigured: isChapaLive(),
      platformFeePercent: env.PLATFORM_FEE_PERCENT,
      transitions: TRANSITIONS,
    }),
  );
});

// --- Contracts ----------------------------------------------------------------

escrowRouter.post(
  "/contracts",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      res
        .status(201)
        .json(ok(await service.createContract(authedUser(req), req.body ?? {})));
    } catch (err) {
      sendError(res, err);
    }
  }),
);

escrowRouter.get(
  "/contracts",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(ok(await service.listContracts(authedUser(req))));
  }),
);

escrowRouter.get(
  "/contracts/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      res.json(ok(await service.getContract(pathParam(req, "id"), authedUser(req))));
    } catch (err) {
      sendError(res, err);
    }
  }),
);

escrowRouter.get(
  "/contracts/:id/events",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      res.json(ok(await service.getContractEvents(pathParam(req, "id"), authedUser(req))));
    } catch (err) {
      sendError(res, err);
    }
  }),
);

/**
 * The payment state of a service request, for either party to it.
 *
 * Keyed by request rather than contract because that is the id both sides
 * already hold: the customer arrives from discovery with it and the provider
 * gets it on the ping, while neither learns the contract id until checkout has
 * started.
 */
escrowRouter.get(
  "/requests/:requestId/contract",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      res.json(
        ok(
          await service.getContractForRequest(
            pathParam(req, "requestId"),
            authedUser(req),
          ),
        ),
      );
    } catch (err) {
      sendError(res, err);
    }
  }),
);

escrowRouter.post(
  "/contracts/:id/fund",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      res.json(
        ok(
          await service.fundContract(pathParam(req, "id"), authedUser(req), {
            returnUrl:
              typeof req.body?.returnUrl === "string" ? req.body.returnUrl : undefined,
            email: typeof req.body?.email === "string" ? req.body.email : undefined,
          }),
        ),
      );
    } catch (err) {
      sendError(res, err);
    }
  }),
);

escrowRouter.post(
  "/contracts/:id/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      res.json(
        ok(await service.startWork(pathParam(req, "id"), authedUser(req), req.body?.reason)),
      );
    } catch (err) {
      sendError(res, err);
    }
  }),
);

escrowRouter.post(
  "/contracts/:id/complete",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const result = await service.completeContract(
        pathParam(req, "id"),
        authedUser(req),
        req.body?.reason,
      );
      // 202: the contract is complete but the money has not landed yet.
      res.status(result.payoutError ? 202 : 200).json(ok(result));
    } catch (err) {
      sendError(res, err);
    }
  }),
);

escrowRouter.post(
  "/contracts/:id/dispute",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      res.json(
        ok(
          await service.disputeContract(
            pathParam(req, "id"),
            authedUser(req),
            req.body?.reason,
          ),
        ),
      );
    } catch (err) {
      sendError(res, err);
    }
  }),
);

// --- Chapa webhook ------------------------------------------------------------

/**
 * Unauthenticated by design — Chapa calls it. Trust comes from the HMAC over
 * the raw body, not from a session. Always answers 200 on a signed-but-ignored
 * delivery so Chapa stops retrying; only a bad signature is rejected.
 */
escrowRouter.post(
  "/webhooks/chapa",
  asyncHandler(async (req, res) => {
    try {
      const outcome = await service.handleChapaWebhook({
        rawBody: req.rawBody ?? JSON.stringify(req.body ?? {}),
        chapaSignature: req.header("chapa-signature") ?? undefined,
        xChapaSignature: req.header("x-chapa-signature") ?? undefined,
      });
      res.json(ok(outcome));
    } catch (err) {
      sendError(res, err);
    }
  }),
);

// --- Admin --------------------------------------------------------------------
// No dispute UI for the hackathon: a shared secret in x-admin-key gates these.

escrowRouter.post(
  "/admin/contracts/:id/force-release",
  requireAdmin,
  asyncHandler(async (req, res) => {
    try {
      const result = await service.adminForceRelease(pathParam(req, "id"), req.body?.reason);
      res.status(result.payoutError ? 202 : 200).json(ok(result));
    } catch (err) {
      sendError(res, err);
    }
  }),
);

escrowRouter.post(
  "/admin/contracts/:id/retry-payout",
  requireAdmin,
  asyncHandler(async (req, res) => {
    try {
      const result = await service.adminRetryPayout(pathParam(req, "id"));
      res.status(result.payoutError ? 202 : 200).json(ok(result));
    } catch (err) {
      sendError(res, err);
    }
  }),
);

escrowRouter.post(
  "/admin/contracts/:id/refund",
  requireAdmin,
  asyncHandler(async (req, res) => {
    try {
      res.json(ok(await service.adminRefund(pathParam(req, "id"), req.body?.reason)));
    } catch (err) {
      sendError(res, err);
    }
  }),
);

// --- Demo-only helpers --------------------------------------------------------
// Seed data, the simulated Chapa checkout page and the console. Mounted only
// when DEMO_MODE is on, and everything under it lives in this folder.
if (env.DEMO_MODE) {
  escrowRouter.use("/dev", devRouter);
}
