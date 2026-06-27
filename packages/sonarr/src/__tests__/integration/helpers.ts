import { injectSonarr } from "@trugamr/testkit/sonarr"
import { Cause, Effect, Exit } from "effect"
import { Sonarr, type SonarrService } from "../../effect.js"

// The live instance resolved by the global setup — either the booted container or
// the one supplied via SONARR_BASE_URL / SONARR_API_KEY.
const LiveSonarr = Sonarr.layer(injectSonarr())

/**
 * Resolve a client operation against the live instance to an Exit, so each test
 * can assert on the success value or read the typed error from the failure
 * channel. Mirrors the mocked suite's `runExit`, swapping the layer.
 */
export const runExit = <A, E>(build: (sonarr: SonarrService) => Effect.Effect<A, E>) =>
  Effect.flatMap(Sonarr, build).pipe(Effect.provide(LiveSonarr), Effect.runPromiseExit)

/** Pull the success value out of an Exit, failing loudly with the cause otherwise. */
export const successOf = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isFailure(exit)) {
    throw new Error(`expected success: ${Cause.pretty(exit.cause)}`)
  }
  return exit.value
}
