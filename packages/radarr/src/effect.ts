/**
 * Radarr SDK — Effect surface, the package's only public entry. Build the client
 * with `Radarr.layer(config)`, provide it once, then read it from context
 * (`yield* Radarr`) so Effect consumers — like the MCP adapter — compose
 * operations natively. The bare `@trugamr/radarr` entry is reserved for a Promise
 * surface layered over this one later.
 */
export { Radarr } from "./internal/client.js"
export type { RadarrService, RadarrV3Api } from "./internal/client.js"
export type { RadarrConfigInput } from "./internal/config.js"
export type { AddMovie } from "./internal/movie.js"
export type { ReleaseGrab } from "./internal/release.js"
export { Movie } from "./internal/schemas/movie.js"
export { MovieLookup } from "./internal/schemas/movie-lookup.js"
export { Quality } from "./internal/schemas/quality.js"
export { QualityProfile } from "./internal/schemas/quality-profile.js"
export { QueueItem, QueuePage } from "./internal/schemas/queue.js"
export { Release } from "./internal/schemas/release.js"
export { RootFolder } from "./internal/schemas/root-folder.js"
export { SystemStatus } from "./internal/schemas/system-status.js"
export * from "./internal/errors.js"
