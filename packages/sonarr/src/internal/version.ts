/** The Sonarr REST API version this SDK targets. Sonarr 3.x and 4.x both speak v3. */
export const API_V3 = "v3"

/**
 * Build a request path under the v3 API, e.g. `v3Path("/system/status")` →
 * `/api/v3/system/status`. The single place the `v3` segment is spelled, so the
 * version lives in one spot rather than scattered across every endpoint.
 */
export const v3Path = (path: string): string => `/api/${API_V3}${path}`
