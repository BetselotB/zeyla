import { Router } from "express";
import type { ContractStatus } from "@zeyla/shared";
import { env } from "../../config/env.js";
import { notImplemented, ok } from "../../lib/respond.js";

/**
 * Escrow state machine — core IP of Zeyla.
 * awaiting_escrow → escrowed → active → completed | disputed
 * Ledger: pending → held → released | refunded
 *
 * Chapa is must-have; in DEMO_MODE simulate webhook confirmation.
 */
export const escrowRouter = Router();

const transitions: Record<ContractStatus, ContractStatus[]> = {
  awaiting_escrow: ["escrowed", "disputed"],
  escrowed: ["active", "disputed"],
  active: ["completed", "disputed"],
  completed: [],
  disputed: ["completed"], // admin release for demo
};

escrowRouter.get("/state-machine", (_req, res) => {
  res.json(
    ok({
      demoMode: env.DEMO_MODE,
      transitions,
      chapaConfigured: Boolean(env.CHAPA_SECRET_KEY),
    }),
  );
});

escrowRouter.post("/contracts", (_req, res) => {
  notImplemented(
    res,
    "Create contract status=awaiting_escrow, initialize Chapa transaction",
  );
});

escrowRouter.post("/webhooks/chapa", (_req, res) => {
  if (env.DEMO_MODE) {
    return res.json(
      ok({
        simulated: true,
        next: "Write escrow_ledger status=held; move contract → escrowed",
      }),
    );
  }
  notImplemented(
    res,
    "Verify Chapa signature against CHAPA_WEBHOOK_SECRET, then hold funds",
  );
});

escrowRouter.post("/contracts/:id/release", (_req, res) => {
  notImplemented(
    res,
    "On completion: payout provider via Chapa transfer (minus fee), ledger → released",
  );
});

/** Demo escape hatch — skip full dispute workflow */
escrowRouter.post("/admin/contracts/:id/force-release", (_req, res) => {
  notImplemented(
    res,
    "Manual admin release for disputed funds (fake if short on time)",
  );
});
