import { Context, type Effect, Layer } from "effect"
import { decodeConfig, type SonarrConfig, type SonarrConfigInput } from "./config.js"
import * as diskSpace from "./disk-space.js"
import * as episode from "./episode.js"
import type { SonarrError } from "./errors.js"
import * as health from "./health.js"
import * as qualityProfile from "./quality-profile.js"
import * as rootFolder from "./root-folder.js"
import type { DiskSpace } from "./schemas/disk-space.js"
import type { Episode } from "./schemas/episode.js"
import type { Health } from "./schemas/health.js"
import type { QualityProfile } from "./schemas/quality-profile.js"
import type { RootFolder } from "./schemas/root-folder.js"
import type { Series } from "./schemas/series.js"
import type { SystemStatus } from "./schemas/system-status.js"
import type { Tag } from "./schemas/tag.js"
import * as series from "./series.js"
import { getStatus } from "./system.js"
import * as tag from "./tag.js"

/** The Sonarr client surface for Effect consumers — operations grouped by resource. */
export interface SonarrService {
  readonly system: {
    readonly getStatus: Effect.Effect<SystemStatus, SonarrError>
  }
  readonly series: {
    readonly list: Effect.Effect<ReadonlyArray<Series>, SonarrError>
    readonly get: (id: number) => Effect.Effect<Series, SonarrError>
  }
  readonly episode: {
    readonly list: (
      params: episode.EpisodeListParams,
    ) => Effect.Effect<ReadonlyArray<Episode>, SonarrError>
  }
  readonly qualityProfile: {
    readonly list: Effect.Effect<ReadonlyArray<QualityProfile>, SonarrError>
  }
  readonly rootFolder: {
    readonly list: Effect.Effect<ReadonlyArray<RootFolder>, SonarrError>
    readonly add: (path: string) => Effect.Effect<RootFolder, SonarrError>
    readonly delete: (id: number) => Effect.Effect<void, SonarrError>
  }
  readonly tag: {
    readonly list: Effect.Effect<ReadonlyArray<Tag>, SonarrError>
    readonly create: (label: string) => Effect.Effect<Tag, SonarrError>
    readonly delete: (id: number) => Effect.Effect<void, SonarrError>
  }
  readonly health: {
    readonly list: Effect.Effect<ReadonlyArray<Health>, SonarrError>
  }
  readonly diskSpace: {
    readonly list: Effect.Effect<ReadonlyArray<DiskSpace>, SonarrError>
  }
}

const make = (config: SonarrConfig): SonarrService => ({
  system: {
    getStatus: getStatus(config),
  },
  series: {
    list: series.list(config),
    get: (id) => series.get(config, id),
  },
  episode: {
    list: (params) => episode.list(config, params),
  },
  qualityProfile: {
    list: qualityProfile.list(config),
  },
  rootFolder: {
    list: rootFolder.list(config),
    add: (path) => rootFolder.add(config, path),
    delete: (id) => rootFolder.remove(config, id),
  },
  tag: {
    list: tag.list(config),
    create: (label) => tag.create(config, label),
    delete: (id) => tag.remove(config, id),
  },
  health: {
    list: health.list(config),
  },
  diskSpace: {
    list: diskSpace.list(config),
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
