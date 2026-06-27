import { inject } from "vitest"
import type { TestProject } from "vitest/node"
import { startServarrContainer } from "../servarr/container.js"
import { RADARR_IMAGE } from "./pinned.js"

// Values the global setup resolves once and hands to every integration test. Kept
// internal: tests read them through `injectRadarr` rather than the raw keys.
declare module "vitest" {
  export interface ProvidedContext {
    radarrBaseUrl: string
    radarrApiKey: string
  }
}

const RADARR_PORT = 7878

// A fixed key for the throwaway container. Radarr honors RADARR__AUTH__APIKEY, so
// we hand it a known key instead of scraping the random one it would generate.
const API_KEY = "0123456789abcdef0123456789abcdef"

// `lscr.io` serves the same LinuxServer image as Docker Hub but without anonymous
// pull-rate limits. Override with RADARR_TEST_IMAGE to try another tag.
const IMAGE = process.env.RADARR_TEST_IMAGE ?? RADARR_IMAGE

export interface RadarrGlobalSetupOptions {
  /** Paths mounted writable, e.g. root folders a suite registers and seeds into. */
  readonly tmpfs?: Record<string, "rw">
}

/**
 * Build a Vitest global setup that points the suite at a Radarr instance. With
 * RADARR_BASE_URL / RADARR_API_KEY set it reuses that instance (an escape hatch for
 * iterating against your own Radarr); otherwise it boots a pinned throwaway
 * container and tears it down when the suite ends.
 */
export const createRadarrGlobalSetup =
  (options: RadarrGlobalSetupOptions = {}) =>
  async ({ provide }: TestProject) => {
    const existingBaseUrl = process.env.RADARR_BASE_URL
    const existingApiKey = process.env.RADARR_API_KEY
    if (existingBaseUrl && existingApiKey) {
      provide("radarrBaseUrl", existingBaseUrl)
      provide("radarrApiKey", existingApiKey)
      return
    }

    const started = await startServarrContainer({
      image: IMAGE,
      port: RADARR_PORT,
      apiKeyEnvVar: "RADARR__AUTH__APIKEY",
      apiKey: API_KEY,
      tmpfs: options.tmpfs,
    })

    provide("radarrBaseUrl", started.baseUrl)
    provide("radarrApiKey", started.apiKey)

    return started.stop
  }

/** The live Radarr the global setup resolved — booted container or escape-hatch instance. */
export const injectRadarr = (): { readonly baseUrl: string; readonly apiKey: string } => ({
  baseUrl: inject("radarrBaseUrl"),
  apiKey: inject("radarrApiKey"),
})
