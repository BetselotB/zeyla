/**
 * Error carrying an HTTP status. Handlers `throw` it and `handle()` turns it
 * into the standard `{ success, data, error }` envelope with the right code.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, details);
  }

  static unauthenticated() {
    return new ApiError(401, "unauthenticated");
  }

  static forbidden(message = "forbidden") {
    return new ApiError(403, message);
  }

  static notFound(what: string) {
    return new ApiError(404, `${what}_not_found`);
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, message, details);
  }

  static unavailable(message: string, details?: unknown) {
    return new ApiError(503, message, details);
  }
}
