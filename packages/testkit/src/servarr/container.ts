import { GenericContainer, Wait } from "testcontainers"

/** A booted throwaway Servarr container, with its resolved address and a teardown. */
export interface StartedServarr {
  readonly baseUrl: string
  readonly apiKey: string
  readonly stop: () => Promise<void>
}

export interface ServarrContainerSpec {
  /** The pinned image, e.g. `lscr.io/linuxserver/radarr:<tag>`. */
  readonly image: string
  /** The port the app listens on inside the container (8989 Sonarr, 7878 Radarr). */
  readonly port: number
  /** The env var the app reads its API key from, e.g. `RADARR__AUTH__APIKEY`. */
  readonly apiKeyEnvVar: string
  /** A fixed key handed to the container so tests don't scrape the generated one. */
  readonly apiKey: string
  /** Paths mounted writable, e.g. root folders a suite registers and seeds into. */
  readonly tmpfs?: Record<string, "rw"> | undefined
  /** Readiness probe path; every Servarr app serves `/ping`. */
  readonly pingPath?: string | undefined
  readonly startupTimeoutMs?: number | undefined
}

/**
 * Boot a pinned Servarr container and wait until it answers its readiness probe.
 * The Sonarr/Radarr global setups share this and keep only their app-specific
 * provide keys and env-var escape hatch local. `lscr.io` serves the LinuxServer
 * images without anonymous pull-rate limits.
 */
export const startServarrContainer = async (
  spec: ServarrContainerSpec,
): Promise<StartedServarr> => {
  const container = await new GenericContainer(spec.image)
    .withEnvironment({ [spec.apiKeyEnvVar]: spec.apiKey })
    .withTmpFs(spec.tmpfs ?? {})
    .withExposedPorts(spec.port)
    .withWaitStrategy(Wait.forHttp(spec.pingPath ?? "/ping", spec.port).forStatusCode(200))
    .withStartupTimeout(spec.startupTimeoutMs ?? 120_000)
    .start()

  return {
    baseUrl: `http://${container.getHost()}:${container.getMappedPort(spec.port)}`,
    apiKey: spec.apiKey,
    stop: async () => {
      await container.stop()
    },
  }
}
