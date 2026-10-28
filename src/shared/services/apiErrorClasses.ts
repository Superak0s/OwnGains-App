export class ApiError extends Error {
  status: number
  details?: unknown
  /**
   * The server's machine-readable discriminator (METRIC_UNKNOWN,
   * VALUE_OUT_OF_RANGE, ...). Present on 4xx only. Branch on this rather than
   * pattern-matching `message`, which is prose and may be reworded.
   */
  code?: string
  /** From `Retry-After`, when the server sent one (429, 503). */
  retryAfterMs?: number
  constructor(
    message: string,
    status: number,
    details?: unknown,
    code?: string,
    retryAfterMs?: number,
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
    this.code = code
    this.retryAfterMs = retryAfterMs
  }
}

/** No answer from the server (refused, unroutable or timed out). Expected while it is down, so not a crash. */
export class ServerUnreachableError extends Error {
  constructor() {
    super("Couldn't reach the server. Check your connection and try again.")
    this.name = "ServerUnreachableError"
  }
}
