/**
 * `@trugamr/kit` — the shared runtime foundation for the Effect-native Servarr
 * SDKs. Each SDK composes `BaseUrl`/`ApiKey` into its own config struct, builds its
 * verbs with `makeHttp` bound to its branded errors, and reuses `optionalNullable`
 * for the family's null-or-absent JSON.
 */
export { ApiKey, BaseUrl, type ServarrRequestConfig } from "./config.js"
export { type HttpErrors, makeHttp, provideTransport, type RequestOptions } from "./http.js"
export { optionalNullable } from "./optional.js"
