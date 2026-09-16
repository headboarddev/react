import type { ErrorCode } from "./types.js";

/**
 * Error thrown for any non-2xx API response, and for network failures.
 *
 * Network failures surface as `status: 0` with code `network_error`, so callers
 * can branch on `err.status === 0` to distinguish "offline" from "API said no".
 */
export class HeadBoardError extends Error {
  readonly name = "HeadBoardError";
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;
  readonly code: ErrorCode | "network_error" | (string & {});
  /** From the `meta.request_id` field — quote this when reporting a bug. */
  readonly requestId?: string;
  /** Seconds to wait, parsed from `Retry-After` on a 429. */
  readonly retryAfter?: number;

  constructor(opts: {
    message: string;
    status: number;
    code: string;
    requestId?: string;
    retryAfter?: number;
  }) {
    super(opts.message);
    this.status = opts.status;
    this.code = opts.code;
    this.requestId = opts.requestId;
    this.retryAfter = opts.retryAfter;
    Object.setPrototypeOf(this, HeadBoardError.prototype);
  }

  /** True when the caller is missing or has an invalid user token. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** True when rate limited. Check `retryAfter` for how long to back off. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** True when the user has already voted on this post. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export function isHeadBoardError(err: unknown): err is HeadBoardError {
  return err instanceof HeadBoardError;
}
