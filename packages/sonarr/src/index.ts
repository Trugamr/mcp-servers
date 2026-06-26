import type { SonarrConfig, SonarrConfigInput } from "./internal/config.js"
import { decodeConfig } from "./internal/config.js"
import { runPromise } from "./internal/run.js"
import type { SystemStatus } from "./internal/schemas/system-status.js"
import { getStatus } from "./internal/system.js"

class SonarrV3 {
  readonly #config: SonarrConfig

  constructor(config: SonarrConfig) {
    this.#config = config
  }

  readonly system = {
    getStatus: (): Promise<SystemStatus> => runPromise(getStatus(this.#config)),
  }
}

/**
 * Sonarr SDK — Promise surface. Effect powers the core internally but never
 * surfaces here: every method returns a `Promise` and rejects with a
 * `SonarrError`. For the Effect surface, import from `@trugamr/sonarr/effect`.
 */
export class Sonarr {
  readonly #v3: SonarrV3

  constructor(config: SonarrConfigInput) {
    this.#v3 = new SonarrV3(decodeConfig(config))
  }

  /** Explicit Sonarr API v3 namespace. */
  get v3(): SonarrV3 {
    return this.#v3
  }

  /** Latest API version (currently v3). */
  get system(): SonarrV3["system"] {
    return this.#v3.system
  }
}

export type { SonarrConfigInput } from "./internal/config.js"
export type { SystemStatus } from "./internal/schemas/system-status.js"
export * from "./internal/errors.js"
