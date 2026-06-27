import { makeHttp } from "@trugamr/kit"
import { RadarrDecodeError, RadarrRequestError, RadarrResponseError } from "./errors.js"

/**
 * The HTTP verbs, bound to Radarr's branded errors. The shared engine lives in
 * `@trugamr/kit`; this is the single place those generic failures map onto the
 * typed `RadarrError` channel. Resource modules import `getJson`/`sendJson`/`del`
 * from here.
 */
export const { getJson, sendJson, sendJsonVoid, del } = makeHttp({
  request: (cause) => new RadarrRequestError({ cause }),
  response: (status, cause) => new RadarrResponseError({ status, cause }),
  decode: (cause) => new RadarrDecodeError({ cause }),
})

export { provideTransport, type RequestOptions } from "@trugamr/kit"
