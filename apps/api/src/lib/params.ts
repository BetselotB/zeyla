import type { Request } from "express";

/**
 * Reads a route parameter as a string.
 *
 * The Express type definitions widen `req.params[name]` to `string | string[]`
 * to cover repeated-parameter patterns. None of our routes use those, so this
 * narrows once here instead of at every call site.
 */
export function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
