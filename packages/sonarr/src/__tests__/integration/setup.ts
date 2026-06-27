import { GenericContainer, Wait } from "testcontainers"
import type { TestProject } from "vitest/node"
import { SONARR_IMAGE } from "./pinned.js"

// Values the global setup resolves once and hands to every integration test.
declare module "vitest" {
  export interface ProvidedContext {
    sonarrBaseUrl: string
    sonarrApiKey: string
  }
}

// `lscr.io` serves the same LinuxServer image as Docker Hub but without anonymous
// pull-rate limits. Override with SONARR_TEST_IMAGE to try another tag.
const IMAGE = process.env.SONARR_TEST_IMAGE ?? SONARR_IMAGE
const SONARR_PORT = 8989

// A fixed key for the throwaway container. Sonarr honors SONARR__AUTH__APIKEY, so
// we hand it a known key instead of scraping the random one it would generate.
const API_KEY = "0123456789abcdef0123456789abcdef"

export default async function setup({ provide }: TestProject) {
  // Escape hatch: if the caller already points us at an instance (their own
  // Sonarr, a shared CI service), use it and skip Docker entirely.
  const existingBaseUrl = process.env.SONARR_BASE_URL
  const existingApiKey = process.env.SONARR_API_KEY
  if (existingBaseUrl && existingApiKey) {
    provide("sonarrBaseUrl", existingBaseUrl)
    provide("sonarrApiKey", existingApiKey)
    return
  }

  const container = await new GenericContainer(IMAGE)
    .withEnvironment({ SONARR__AUTH__APIKEY: API_KEY })
    .withExposedPorts(SONARR_PORT)
    .withWaitStrategy(Wait.forHttp("/ping", SONARR_PORT).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start()

  provide("sonarrBaseUrl", `http://${container.getHost()}:${container.getMappedPort(SONARR_PORT)}`)
  provide("sonarrApiKey", API_KEY)

  return async () => {
    await container.stop()
  }
}
