/**
 * Sonarr SDK — Effect surface, the package's only public entry. Build the client
 * with `Sonarr.layer(config)`, provide it once, then read it from context
 * (`yield* Sonarr`) so Effect consumers — like the MCP adapter — compose
 * operations natively. The bare `@trugamr/sonarr` entry is reserved for a
 * Promise surface layered over this one later.
 */
export { Sonarr } from "./internal/client.js"
export type { SonarrService } from "./internal/client.js"
export type { SonarrConfigInput } from "./internal/config.js"
export { SystemStatus } from "./internal/schemas/system-status.js"
export * from "./internal/errors.js"
