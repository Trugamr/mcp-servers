import { Data } from "effect"

/** A request never reached Sonarr (connection refused, DNS, timeout, …). */
export class SonarrRequestError extends Data.TaggedError("SonarrRequestError")<{
  readonly cause: unknown
}> {
  get message() {
    return "Could not reach the Sonarr instance"
  }
}

/** Sonarr responded with a non-2xx status. */
export class SonarrResponseError extends Data.TaggedError("SonarrResponseError")<{
  readonly status: number
  readonly cause: unknown
}> {
  get message() {
    return `Sonarr returned HTTP ${this.status}`
  }
}

/** The response body could not be parsed/decoded into the expected schema. */
export class SonarrDecodeError extends Data.TaggedError("SonarrDecodeError")<{
  readonly cause: unknown
}> {
  get message() {
    return "Could not decode the Sonarr response"
  }
}

export type SonarrError = SonarrRequestError | SonarrResponseError | SonarrDecodeError
