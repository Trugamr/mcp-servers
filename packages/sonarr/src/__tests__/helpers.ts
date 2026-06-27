import { Cause, Effect, Exit, Option } from "effect"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll } from "vitest"
import { Sonarr, type SonarrService } from "../effect.js"

export const baseUrl = "http://sonarr.test"
export const apiKey = "test-api-key"

/** A Sonarr client pointed at the mocked instance, shared across the SDK tests. */
export const TestSonarr = Sonarr.layer({ baseUrl, apiKey })

/**
 * Resolve a client operation against `TestSonarr` to an Exit, so each test can
 * assert on the success value or read the typed error from the failure channel.
 */
export const runExit = <A, E>(build: (sonarr: SonarrService) => Effect.Effect<A, E>) =>
  Effect.flatMap(Sonarr, build).pipe(Effect.provide(TestSonarr), Effect.runPromiseExit)

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
