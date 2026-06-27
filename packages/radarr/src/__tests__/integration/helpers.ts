import { injectRadarr } from "@trugamr/testkit/radarr"
import { Cause, Effect, Exit, Option } from "effect"
import { Radarr, type RadarrService } from "../../effect.js"

// The live instance resolved by the global setup — either the booted container or
// the one supplied via RADARR_BASE_URL / RADARR_API_KEY.
const LiveRadarr = Radarr.layer(injectRadarr())

/**
 * Resolve a client operation against the live instance to an Exit, so each test can
 * assert on the success value or read the typed error from the failure channel.
 * Mirrors the mocked suite's `runExit`, swapping the layer.
 */
export const runExit = <A, E>(build: (radarr: RadarrService) => Effect.Effect<A, E>) =>
  Effect.flatMap(Radarr, build).pipe(Effect.provide(LiveRadarr), Effect.runPromiseExit)

/** Pull the success value out of an Exit, failing loudly with the cause otherwise. */
export const successOf = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isFailure(exit)) {
    throw new Error(`expected success: ${Cause.pretty(exit.cause)}`)
  }
  return exit.value
}

/**
 * Pull the typed failure out of an Exit. A defect (or success) yields `None` here
 * and throws, so every error test also proves the failure is typed.
 */
export const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (Exit.isSuccess(exit)) {
    throw new Error("expected failure, got success")
  }
  return Option.getOrThrow(Cause.failureOption(exit.cause))
}
