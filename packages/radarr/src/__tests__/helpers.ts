import { Cause, Effect, Exit, Option } from "effect"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll } from "vitest"
import { Radarr, type RadarrConfigInput, type RadarrService } from "../effect.js"
import { apiBase } from "../internal/version.js"

export const baseUrl = "http://radarr.test"
export const apiKey = "test-api-key"

/**
 * Absolute URL for a v3 API path on the mocked instance, e.g. `apiUrl("/movie")`.
 * Reuses the SDK's own `apiBase`, so a mocked URL can't drift from the real prefix.
 */
export const apiUrl = (path: string): string => `${baseUrl}${apiBase}${path}`

/**
 * Resolve a client operation to an Exit, so each test can assert on the success
 * value or read the typed error from the failure channel. Defaults to the mocked
 * instance; pass `config` to drive a differently-configured client (e.g. a baseUrl
 * variant).
 */
export const runExit = <A, E>(
  build: (radarr: RadarrService) => Effect.Effect<A, E>,
  config: RadarrConfigInput = { baseUrl, apiKey },
) => Effect.flatMap(Radarr, build).pipe(Effect.provide(Radarr.layer(config)), Effect.runPromiseExit)

/** Pull the success value out of an Exit, failing loudly with the cause otherwise. */
export const successOf = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isFailure(exit)) {
    throw new Error(`expected success: ${Cause.pretty(exit.cause)}`)
  }
  return exit.value
}

/**
 * Pull the typed failure out of an Exit. A defect (or success) yields `None` here
 * and throws, so every error test also proves the failure is typed — not a thrown
 * exception or an Effect defect.
 */
export const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (Exit.isSuccess(exit)) {
    throw new Error("expected failure, got success")
  }
  return Option.getOrThrow(Cause.failureOption(exit.cause))
}

/** An MSW server with its lifecycle hooks registered for the calling test file. */
export const setupMockServer = () => {
  const server = setupServer()
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())
  return server
}
