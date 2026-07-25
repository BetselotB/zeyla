import crypto from "node:crypto";
import axios, { type AxiosInstance } from "axios";
import { env } from "../../config/env.js";

/**
 * Chapa client.
 *
 * Live whenever CHAPA_SECRET_KEY is set — a sandbox key exercises the real
 * HTTP calls. With no key we fall back to a local simulator (DEMO_MODE must be
 * on) so the whole escrow flow is demoable offline. `simulated` is surfaced on
 * every response so nothing can quietly pretend a fake payout was real.
 */

export class ChapaError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export function isChapaLive(): boolean {
  return Boolean(env.CHAPA_SECRET_KEY);
}

function assertUsable(): void {
  if (!isChapaLive() && !env.DEMO_MODE) {
    throw new ChapaError("chapa_not_configured", 503);
  }
}

let http: AxiosInstance | null = null;

function client(): AxiosInstance {
  if (!http) {
    http = axios.create({
      baseURL: env.CHAPA_API_BASE,
      timeout: 15_000,
      headers: { Authorization: `Bearer ${env.CHAPA_SECRET_KEY}` },
    });
  }
  return http;
}

export function newTxRef(contractId: string): string {
  return `zeyla-${contractId.slice(0, 8)}-${Date.now()}-${crypto
    .randomBytes(3)
    .toString("hex")}`;
}

export interface InitializeInput {
  amount: number;
  currency: string;
  txRef: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  callbackUrl: string;
  returnUrl: string;
  title?: string;
}

export interface InitializeResult {
  checkoutUrl: string;
  simulated: boolean;
}

export async function initializeTransaction(
  input: InitializeInput,
): Promise<InitializeResult> {
  assertUsable();

  if (!isChapaLive()) {
    // Local stand-in for Chapa's hosted checkout page.
    const url = new URL(`${env.PUBLIC_API_URL}/api/escrow/dev/checkout`);
    url.searchParams.set("tx_ref", input.txRef);
    url.searchParams.set("amount", String(input.amount));
    url.searchParams.set("currency", input.currency);
    url.searchParams.set("return_url", input.returnUrl);
    return { checkoutUrl: url.toString(), simulated: true };
  }

  try {
    const { data } = await client().post("/transaction/initialize", {
      amount: input.amount.toFixed(2),
      currency: input.currency,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      phone_number: input.phone,
      tx_ref: input.txRef,
      callback_url: input.callbackUrl,
      return_url: input.returnUrl,
      customization: {
        title: "Zeyla escrow",
        description: input.title ?? "Funds held until the job is completed",
      },
    });

    const checkoutUrl = data?.data?.checkout_url;
    if (!checkoutUrl) {
      throw new ChapaError(`chapa_initialize_failed: ${data?.message ?? "no checkout_url"}`);
    }
    return { checkoutUrl, simulated: false };
  } catch (err) {
    if (err instanceof ChapaError) throw err;
    throw new ChapaError(`chapa_initialize_failed: ${describe(err)}`);
  }
}

export interface VerifyResult {
  paid: boolean;
  amount: number | null;
  currency: string | null;
  simulated: boolean;
}

/**
 * Second source of truth for a webhook. A valid signature says the message is
 * from Chapa; this says the money actually arrived.
 */
export async function verifyTransaction(txRef: string): Promise<VerifyResult> {
  assertUsable();

  if (!isChapaLive()) {
    return { paid: true, amount: null, currency: null, simulated: true };
  }

  try {
    const { data } = await client().get(
      `/transaction/verify/${encodeURIComponent(txRef)}`,
    );
    const payload = data?.data;
    return {
      paid: data?.status === "success" && payload?.status === "success",
      amount: payload?.amount != null ? Number(payload.amount) : null,
      currency: payload?.currency ?? null,
      simulated: false,
    };
  } catch (err) {
    throw new ChapaError(`chapa_verify_failed: ${describe(err)}`);
  }
}

export interface TransferInput {
  amount: number;
  currency: string;
  reference: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
}

export interface TransferResult {
  transferRef: string;
  simulated: boolean;
}

/**
 * Payout to the provider on completion.
 *
 * HACKATHON SHORTCUT: provider bank details are not modelled in the schema
 * (the providers table belongs to the marketplace module), so unless the
 * caller passes real account details this simulates the transfer and records
 * a `sim-` reference. The ledger row is honest about which one happened.
 */
export async function transferToProvider(
  input: Partial<TransferInput> & { amount: number; currency: string; reference: string },
): Promise<TransferResult> {
  assertUsable();

  const missingBankDetails =
    !input.accountName || !input.accountNumber || !input.bankCode;

  if (!isChapaLive() || missingBankDetails) {
    return { transferRef: `sim-${input.reference}`, simulated: true };
  }

  try {
    const { data } = await client().post("/transfers", {
      account_name: input.accountName,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      amount: input.amount.toFixed(2),
      currency: input.currency,
      reference: input.reference,
    });

    if (data?.status !== "success") {
      throw new ChapaError(`chapa_transfer_failed: ${data?.message ?? "unknown"}`);
    }
    return { transferRef: data?.data ?? input.reference, simulated: false };
  } catch (err) {
    if (err instanceof ChapaError) throw err;
    throw new ChapaError(`chapa_transfer_failed: ${describe(err)}`);
  }
}

function describe(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return `${err.response?.status ?? "network"} ${JSON.stringify(err.response?.data ?? err.message)}`;
  }
  return err instanceof Error ? err.message : "unknown_error";
}
