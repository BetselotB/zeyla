import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ApiResponse } from "@zeyla/shared";

export type { ApiResponse };

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null };
}

export function fail(error: string): ApiResponse<never> {
  return { success: false, data: null, error };
}

/** Stub responder — keeps unbuilt endpoints inside the envelope. */
export function notImplemented(res: Response, hint: string) {
  res.status(501).json({ success: false, data: { hint }, error: "not_implemented" });
}

/**
 * Wraps an async handler so a rejected promise reaches the error middleware
 * instead of hanging the request. Satisfies the "never throws unhandled" rule
 * without every handler repeating the same try/catch.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const message = err instanceof Error ? err.message : "internal_error";
  console.error("Unhandled error:", err);
  if (res.headersSent) return;
  res.status(500).json(fail(message));
}
