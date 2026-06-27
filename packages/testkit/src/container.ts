import { GenericContainer, Wait } from "testcontainers"

/** A booted service: the base URL to reach its HTTP API, plus a stop hook. */
export interface BootedService {
  readonly baseUrl: string
  readonly stop: () => Promise<unknown>
}

export interface ServiceContainerOptions {
  /** Image reference, e.g. a pinned `lscr.io/linuxserver/<app>:<tag>`. */
  readonly image: string
  /** Container port the HTTP API listens on. */
  readonly port: number
  /** Fixed API key handed to the app through `apiKeyEnv`. */
  readonly apiKey: string
  /** Env var the app reads its API key from, e.g. `SONARR__AUTH__APIKEY`. */
  readonly apiKeyEnv: string
  /** Path polled for a 200 before the container is considered ready, e.g. `/ping`. */
  readonly healthPath: string
  /** Paths mounted as writable tmpfs, so tests needn't provision real disks. */
  readonly tmpfs?: Record<string, "rw">
  /** How long to wait for the container to become healthy. Defaults to 120s. */
  readonly startupTimeoutMs?: number
}

/**
 * Boot a pinned *arr-style service in a throwaway container: a fixed API key via
 * env (so tests skip scraping a generated one), optional writable tmpfs paths, and
 * a health-gated wait. Generic across apps — the caller supplies the image, port,
 * key env, and health path.
 */
export const bootServiceContainer = async (
  options: ServiceContainerOptions,
): Promise<BootedService> => {
  const container = await new GenericContainer(options.image)
    .withEnvironment({ [options.apiKeyEnv]: options.apiKey })
    .withTmpFs(options.tmpfs ?? {})
    .withExposedPorts(options.port)
    .withWaitStrategy(Wait.forHttp(options.healthPath, options.port).forStatusCode(200))
    .withStartupTimeout(options.startupTimeoutMs ?? 120_000)
    .start()

  return {
    baseUrl: `http://${container.getHost()}:${container.getMappedPort(options.port)}`,
    stop: () => container.stop(),
  }
}
