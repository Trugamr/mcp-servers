import { makeHttp } from "@trugamr/kit"
import { SonarrDecodeError, SonarrRequestError, SonarrResponseError } from "./errors.js"

/**
 * The HTTP verbs, bound to Sonarr's branded errors. The shared engine lives in
 * `@trugamr/kit`; this is the single place those generic failures map onto the
 * typed `SonarrError` channel. Resource modules import `getJson`/`sendJson`/`del`
 * from here.
 */
export const { getJson, sendJson, del } = makeHttp({
  request: (cause) => new SonarrRequestError({ cause }),
  response: (status, cause) => new SonarrResponseError({ status, cause }),
  decode: (cause) => new SonarrDecodeError({ cause }),
})

export { provideTransport, type RequestOptions } from "@trugamr/kit"
