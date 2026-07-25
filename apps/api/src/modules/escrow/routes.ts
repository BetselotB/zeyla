import { Router } from "express";
import type { ContractStatus } from "@zeyla/shared";
import { env } from "../../config/env.js";

/**
 * Escrow state machine — core IP of Zeyla.
 * awaiting_escrow → escrowed → active → completed | disputed
 * Ledger: pending → held → released | refunded
 *
 * Telebirr is must-have; in DEMO_MODE simulate webhook confirmation.
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
  res.json({
    demoMode: env.DEMO_MODE,
    transitions,
    telebirrConfigured: Boolean(env.TELEBIRR_API_KEY),
  });
});

escrowRouter.post("/contracts", (_req, res) => {
  res.status(501).json({
    error: "not_implemented",
    hint: "Create contract status=awaiting_escrow, trigger Telebirr STK push",
  });
});

escrowRouter.post("/webhooks/telebirr", (_req, res) => {
  if (env.DEMO_MODE) {
    return res.json({
      ok: true,
      simulated: true,
      next: "Write escrow_ledger status=held; move contract → escrowed",
    });
  }
  res.status(501).json({ error: "not_implemented" });
});

escrowRouter.post("/contracts/:id/release", (_req, res) => {
  res.status(501).json({
    error: "not_implemented",
    hint: "On completion: payout provider (minus fee), ledger → released",
  });
});

/** Demo escape hatch — skip full dispute workflow */
escrowRouter.post("/admin/contracts/:id/force-release", (_req, res) => {
  res.status(501).json({
    error: "not_implemented",
    hint: "Manual admin release for disputed funds (fake if short on time)",
  });
});
