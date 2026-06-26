/**
 * Sonarr SDK — Effect surface. Operations return `Effect<A, SonarrError>` (fully
 * provided, `R = never`) so Effect consumers — like the MCP adapter — can compose
 * them natively. Default callers should use the Promise surface from `@trugamr/sonarr`.
 */
export { decodeConfig, SonarrConfig } from "./internal/config.js"
export type { SonarrConfigInput } from "./internal/config.js"
export { getStatus } from "./internal/system.js"
export { SystemStatus } from "./internal/schemas/system-status.js"
export * from "./internal/errors.js"
