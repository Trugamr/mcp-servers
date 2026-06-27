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
export type { EpisodeListParams } from "./internal/episode.js"
export { DiskSpace } from "./internal/schemas/disk-space.js"
export { Episode } from "./internal/schemas/episode.js"
export { Health } from "./internal/schemas/health.js"
export { QualityProfile } from "./internal/schemas/quality-profile.js"
export { RootFolder } from "./internal/schemas/root-folder.js"
export { Series } from "./internal/schemas/series.js"
export { SystemStatus } from "./internal/schemas/system-status.js"
export { Tag } from "./internal/schemas/tag.js"
export * from "./internal/errors.js"
