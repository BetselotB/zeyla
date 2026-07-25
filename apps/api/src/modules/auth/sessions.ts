import crypto from "node:crypto";
import { query } from "../../db/client.js";
import { env } from "../../config/env.js";

/**
 * Opaque bearer tokens, stored hashed and revocable.
 *
 * Used when AUTH_OTP_PROVIDER=mock. When Supabase phone auth is configured the
 * Supabase JWT is authoritative instead and nothing is written here — see
 * supabase.ts. Deliberately not a self-issued JWT: an opaque token we can
 * revoke beats hand-rolling token signing.
 */

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export async function issueSession(userId: string): Promise<IssuedSession> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + env.AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000,
  );

  await query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt],
  );

  return { token, expiresAt };
}

export async function resolveSession(token: string): Promise<string | null> {
  const { rows } = await query<{ user_id: string }>(
    `SELECT user_id
       FROM auth_sessions
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0]?.user_id ?? null;
}

export async function revokeSession(token: string): Promise<void> {
  await query(
    `UPDATE auth_sessions
        SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(token)],
  );
}
