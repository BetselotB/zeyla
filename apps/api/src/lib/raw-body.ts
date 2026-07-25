import type { Request } from "express";

/**
 * Keeps the exact bytes of a request body around after express.json() has
 * parsed it.
 *
 * Payment webhooks are signed over the raw payload, so re-serialising
 * `req.body` to check an HMAC does not work — key order and whitespace differ.
 * Wire it up once in index.ts:
 *
 *   app.use(express.json({ limit: "12mb", verify: captureRawBody }))
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Raw request body, present for JSON requests. */
      rawBody?: string;
    }
  }
}

export function captureRawBody(
  req: Request,
  _res: unknown,
  buf: Buffer,
  encoding?: string,
): void {
  if (buf?.length) {
    req.rawBody = buf.toString((encoding as BufferEncoding) || "utf8");
  }
}
