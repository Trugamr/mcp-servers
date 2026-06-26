import { Context, Layer, type Effect } from "effect"
import { decodeConfig, type SonarrConfig, type SonarrConfigInput } from "./config.js"
import type { SonarrError } from "./errors.js"
import type { SystemStatus } from "./schemas/system-status.js"
import { getStatus } from "./system.js"

/** The Sonarr client surface for Effect consumers — operations grouped by resource. */
export interface SonarrService {
  readonly system: {
    readonly getStatus: Effect.Effect<SystemStatus, SonarrError>
  }
}

const make = (config: SonarrConfig): SonarrService => ({
  system: {
    getStatus: getStatus(config),
  },
})

/**
 * The Sonarr client as an Effect service. Provide `Sonarr.layer(config)` once,
 * then read the client from context with `yield* Sonarr` — the idiomatic
 * alternative to threading config through every call.
 */
export class Sonarr extends Context.Tag("@trugamr/sonarr/Sonarr")<Sonarr, SonarrService>() {
  static readonly layer = (config: SonarrConfigInput): Layer.Layer<Sonarr> =>
    Layer.sync(Sonarr, () => make(decodeConfig(config)))
}
