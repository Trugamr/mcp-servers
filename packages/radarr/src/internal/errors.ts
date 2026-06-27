import { Data } from "effect"

/** A request never reached Radarr (connection refused, DNS, timeout, …). */
export class RadarrRequestError extends Data.TaggedError("RadarrRequestError")<{
  readonly cause: unknown
}> {
  get message() {
    return "Could not reach the Radarr instance"
  }
}

/** Radarr responded with a non-2xx status. */
export class RadarrResponseError extends Data.TaggedError("RadarrResponseError")<{
  readonly status: number
  readonly cause: unknown
}> {
  get message() {
    return `Radarr returned HTTP ${this.status}`
  }
}

/** The response body could not be parsed/decoded into the expected schema. */
export class RadarrDecodeError extends Data.TaggedError("RadarrDecodeError")<{
  readonly cause: unknown
}> {
  get message() {
    return "Could not decode the Radarr response"
  }
}

export type RadarrError = RadarrRequestError | RadarrResponseError | RadarrDecodeError
