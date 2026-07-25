import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler, fail, ok } from "../../../lib/respond.js";
import { ApiError } from "./errors.js";

/**
 * Route wrapper for the marketplace / realtime / notifications / trust modules.
 *
 * The handler returns plain data and this wraps it in `ok()`. Anything thrown is
 * translated: ApiError keeps its status, a Zod failure becomes 400 with the
 * offending fields, everything else becomes 500. Satisfies the "never throws
 * unhandled" rule without a try/catch in every handler.
 */
export function handle<T>(
  handler: (req: Request, res: Response) => Promise<T>,
  options: { status?: number } = {},
) {
  return asyncHandler(async (req, res) => {
    try {
      const data = await handler(req, res);
      if (res.headersSent) return;
      res.status(options.status ?? 200).json(ok(data));
    } catch (err) {
      if (res.headersSent) return;

      if (err instanceof ApiError) {
        res.status(err.status).json({
          success: false,
          data: err.details === undefined ? null : { details: err.details },
          error: err.message,
        });
        return;
      }

      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          data: { details: err.flatten().fieldErrors },
          error: "invalid_request",
        });
        return;
      }

      console.error(`[${req.method} ${req.originalUrl}]`, err);
      res.status(500).json(fail("internal_error"));
    }
  });
}
