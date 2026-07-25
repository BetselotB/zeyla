import crypto from "node:crypto";

/**
 * Chapa webhook authentication.
 *
 * Chapa sends two headers and they are computed differently:
 *   Chapa-Signature   = HMAC-SHA256(raw request body, webhook secret)
 *   x-chapa-signature = HMAC-SHA256(webhook secret, webhook secret)
 *
 * The second one carries no payload binding, so it proves only that the caller
 * knows the secret. We accept either, but the body-bound one is checked first
 * and is what should be relied on. Verification runs against the *raw bytes* —
 * re-serialising the parsed JSON would change whitespace and key order and
 * break the digest.
 */

export function signPayload(rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function signSecret(secret: string): string {
  return crypto.createHmac("sha256", secret).update(secret).digest("hex");
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export type SignatureResult =
  | { valid: true; matched: "body" | "secret" }
  | { valid: false; reason: "no_secret_configured" | "missing_signature" | "mismatch" };

export function verifyChapaSignature(input: {
  rawBody: string;
  secret: string;
  headers: { chapaSignature?: string; xChapaSignature?: string };
}): SignatureResult {
  if (!input.secret) return { valid: false, reason: "no_secret_configured" };

  const { chapaSignature, xChapaSignature } = input.headers;
  if (!chapaSignature && !xChapaSignature) {
    return { valid: false, reason: "missing_signature" };
  }

  const bodyDigest = signPayload(input.rawBody, input.secret);
  for (const candidate of [chapaSignature, xChapaSignature]) {
    if (candidate && safeEquals(candidate, bodyDigest)) {
      return { valid: true, matched: "body" };
    }
  }

  const secretDigest = signSecret(input.secret);
  if (xChapaSignature && safeEquals(xChapaSignature, secretDigest)) {
    return { valid: true, matched: "secret" };
  }

  return { valid: false, reason: "mismatch" };
}
