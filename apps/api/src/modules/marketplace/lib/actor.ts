import type { Request } from "express";
import { ApiError } from "./errors.js";

/**
 * Caller identity.
 *
 * TEMPORARY: Supabase JWT verification belongs to the auth module and does not
 * exist yet, so until it lands the caller sends `x-user-id`. Every consumer goes
 * through this file, so swapping in that middleware is a one-file change —
 * nothing else in marketplace/realtime/trust/notifications reads the header.
 */
export interface Actor {
  userId: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function readActor(req: Request): Actor | null {
  const header = req.header("x-user-id");
  return isUuid(header) ? { userId: header } : null;
}

export function requireActor(req: Request): Actor {
  const actor = readActor(req);
  if (!actor) throw ApiError.unauthenticated();
  return actor;
}
