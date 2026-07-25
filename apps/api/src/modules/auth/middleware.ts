import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "../../config/env.js";
import { fail } from "../../lib/respond.js";
import { findUserByAuthUid, findUserById, type UserRow } from "./repo.js";
import { resolveSession } from "./sessions.js";
import { isSupabaseConfigured, verifySupabaseToken } from "./supabase.js";

/**
 * Bearer-token authentication for every protected route in the API.
 * Exported for the escrow module too — both belong to the Identity & Money
 * owner. Other modules are welcome to import `requireAuth`.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth / optionalAuth. */
      authUser?: UserRow;
    }
  }
}

function readBearer(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

/** Supabase access tokens are JWTs; our own session tokens are not. */
function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}

/**
 * Two token flavours are accepted:
 * 1. A Supabase access token (when Supabase is configured).
 * 2. An opaque session token issued by this API's mock OTP flow.
 *
 * The shape check matters: verifying with Supabase is a network round-trip, and
 * without it every mock-session request would pay for a call that is certain to
 * fail before falling through to the local lookup.
 */
async function resolveUser(token: string): Promise<UserRow | null> {
  if (isSupabaseConfigured() && looksLikeJwt(token)) {
    const identity = await verifySupabaseToken(token);
    if (identity) {
      const byUid = await findUserByAuthUid(identity.uid);
      if (byUid) return byUid;
    }
  }

  const userId = await resolveSession(token);
  return userId ? findUserById(userId) : null;
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = readBearer(req);
  if (!token) {
    res.status(401).json(fail("missing_bearer_token"));
    return;
  }

  resolveUser(token)
    .then((user) => {
      if (!user) {
        res.status(401).json(fail("invalid_or_expired_token"));
        return;
      }
      req.authUser = user;
      next();
    })
    .catch(next);
};

/** Populates req.authUser when a valid token is present, never rejects. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = readBearer(req);
  if (!token) {
    next();
    return;
  }

  resolveUser(token)
    .then((user) => {
      if (user) req.authUser = user;
      next();
    })
    .catch(() => next());
};

/** Throws rather than returning undefined — use inside requireAuth routes. */
export function authedUser(req: Request): UserRow {
  const user = req.authUser;
  if (!user) throw new Error("route_missing_requireAuth");
  return user;
}

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Guards the manual dispute-release endpoints. There is no admin UI for the
 * hackathon, so a shared secret in `x-admin-key` stands in for one. Refuses
 * everything when ADMIN_API_KEY is unset so an unconfigured deploy cannot be
 * drained by anyone who guesses the URL.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!env.ADMIN_API_KEY) {
    res.status(503).json(fail("admin_api_key_not_configured"));
    return;
  }

  const provided = req.header("x-admin-key");
  if (!provided || !safeEquals(provided, env.ADMIN_API_KEY)) {
    res.status(403).json(fail("admin_forbidden"));
    return;
  }

  next();
}
