import crypto from "node:crypto";
import { query } from "../../db/client.js";
import { env } from "../../config/env.js";

/**
 * Mock OTP provider — the default for the hackathon so login works without an
 * SMS bill or a configured Supabase phone provider. Codes are hashed at rest
 * and single-use, so swapping to real SMS later only changes delivery.
 */

function hashCode(phone: string, code: string) {
  return crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

function generateCode(): string {
  // Uniform over 000000-999999; avoids the modulo bias of `% 1000000`.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export interface IssuedOtp {
  code: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

export async function issueOtp(phone: string): Promise<IssuedOtp> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + env.AUTH_OTP_TTL_SECONDS * 1000);

  // Only the newest code for a phone should be live.
  await query(
    `UPDATE auth_otp_codes
        SET consumed_at = now()
      WHERE phone = $1 AND consumed_at IS NULL`,
    [phone],
  );

  await query(
    `INSERT INTO auth_otp_codes (phone, code_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [phone, hashCode(phone, code), expiresAt],
  );

  return { code, expiresAt, expiresInSeconds: env.AUTH_OTP_TTL_SECONDS };
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_code" | "expired" | "too_many_attempts" | "bad_code" };

export async function verifyOtp(
  phone: string,
  code: string,
): Promise<OtpVerifyResult> {
  const { rows } = await query<{
    id: string;
    code_hash: string;
    expires_at: Date;
    attempts: number;
  }>(
    `SELECT id, code_hash, expires_at, attempts
       FROM auth_otp_codes
      WHERE phone = $1 AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [phone],
  );

  const row = rows[0];
  if (!row) return { ok: false, reason: "no_code" };

  if (row.expires_at.getTime() < Date.now()) {
    await query(`UPDATE auth_otp_codes SET consumed_at = now() WHERE id = $1`, [
      row.id,
    ]);
    return { ok: false, reason: "expired" };
  }

  if (row.attempts >= env.AUTH_OTP_MAX_ATTEMPTS) {
    await query(`UPDATE auth_otp_codes SET consumed_at = now() WHERE id = $1`, [
      row.id,
    ]);
    return { ok: false, reason: "too_many_attempts" };
  }

  const expected = Buffer.from(row.code_hash, "hex");
  const actual = Buffer.from(hashCode(phone, code), "hex");
  const matches =
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!matches) {
    await query(
      `UPDATE auth_otp_codes SET attempts = attempts + 1 WHERE id = $1`,
      [row.id],
    );
    return { ok: false, reason: "bad_code" };
  }

  await query(`UPDATE auth_otp_codes SET consumed_at = now() WHERE id = $1`, [
    row.id,
  ]);
  return { ok: true };
}
