import type { Request } from "express";
import { ApiError } from "./errors.js";

/**
 * Caller identity for marketplace / realtime / trust / notifications.
 *
 * The token itself is verified by `requireAuth` in the auth module (Supabase
 * JWT or mock-OTP session, its choice) which puts the user row on the request.
 * This file only narrows that row to what these modules need, so a route that
 * forgets `requireAuth` fails closed with 401 instead of running unauthenticated.
 */
export interface Actor {
  userId: string;
  role: "user" | "provider";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function readActor(req: Request): Actor | null {
  const user = req.authUser;
  return user ? { userId: user.id, role: user.role } : null;
}

export function requireActor(req: Request): Actor {
  const actor = readActor(req);
  if (!actor) throw ApiError.unauthenticated();
  return actor;
}
