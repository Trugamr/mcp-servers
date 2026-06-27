import { GenericContainer, Wait } from "testcontainers"
import { inject } from "vitest"
import type { TestProject } from "vitest/node"
import { SONARR_IMAGE } from "./pinned.js"

// Values the global setup resolves once and hands to every integration test. Kept
// internal: tests read them through `injectSonarr` rather than the raw keys.
declare module "vitest" {
  export interface ProvidedContext {
    sonarrBaseUrl: string
    sonarrApiKey: string
  }
}

const SONARR_PORT = 8989

// A fixed key for the throwaway container. Sonarr honors SONARR__AUTH__APIKEY, so
// we hand it a known key instead of scraping the random one it would generate.
const API_KEY = "0123456789abcdef0123456789abcdef"

// `lscr.io` serves the same LinuxServer image as Docker Hub but without anonymous
// pull-rate limits. Override with SONARR_TEST_IMAGE to try another tag.
const IMAGE = process.env.SONARR_TEST_IMAGE ?? SONARR_IMAGE

export interface SonarrGlobalSetupOptions {
  /** Paths mounted writable, e.g. root folders a suite registers and seeds into. */
  readonly tmpfs?: Record<string, "rw">
}

/**
 * Build a Vitest global setup that points the suite at a Sonarr instance. With
 * SONARR_BASE_URL / SONARR_API_KEY set it reuses that instance (an escape hatch for
 * iterating against your own Sonarr); otherwise it boots a pinned throwaway
 * container and tears it down when the suite ends.
 */
export const createSonarrGlobalSetup =
  (options: SonarrGlobalSetupOptions = {}) =>
  async ({ provide }: TestProject) => {
    const existingBaseUrl = process.env.SONARR_BASE_URL
    const existingApiKey = process.env.SONARR_API_KEY
    if (existingBaseUrl && existingApiKey) {
      provide("sonarrBaseUrl", existingBaseUrl)
      provide("sonarrApiKey", existingApiKey)
      return
    }

    const container = await new GenericContainer(IMAGE)
      .withEnvironment({ SONARR__AUTH__APIKEY: API_KEY })
      .withTmpFs(options.tmpfs ?? {})
      .withExposedPorts(SONARR_PORT)
      .withWaitStrategy(Wait.forHttp("/ping", SONARR_PORT).forStatusCode(200))
      .withStartupTimeout(120_000)
      .start()

    provide(
      "sonarrBaseUrl",
      `http://${container.getHost()}:${container.getMappedPort(SONARR_PORT)}`,
    )
    provide("sonarrApiKey", API_KEY)

    return async () => {
      await container.stop()
    }
  }

/** The live Sonarr the global setup resolved — booted container or escape-hatch instance. */
export const injectSonarr = (): { readonly baseUrl: string; readonly apiKey: string } => ({
  baseUrl: inject("sonarrBaseUrl"),
  apiKey: inject("sonarrApiKey"),
})
