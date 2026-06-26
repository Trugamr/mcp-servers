import { Data } from "effect"

/** A request never reached Sonarr (connection refused, DNS, timeout, …). */
export class SonarrRequestError extends Data.TaggedError("SonarrRequestError")<{
  readonly cause: unknown
}> {}

/** Sonarr responded with a non-2xx status. */
export class SonarrResponseError extends Data.TaggedError("SonarrResponseError")<{
  readonly status: number
  readonly cause: unknown
}> {}

/** The response body could not be parsed/decoded into the expected schema. */
export class SonarrDecodeError extends Data.TaggedError("SonarrDecodeError")<{
  readonly cause: unknown
}> {}

export type SonarrError = SonarrRequestError | SonarrResponseError | SonarrDecodeError
