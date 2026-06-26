import { Cause, Effect, Exit } from "effect"

/**
 * Run a fully-provided Effect as a Promise that rejects with the *actual* typed
 * error instance — not Effect's `FiberFailure` wrapper — so Promise consumers can
 * use `try/catch` and `instanceof` naturally. `Cause.squash` yields the failure
 * value when present and falls back to defects/interrupts otherwise.
 */
export const runPromise = async <A, E>(effect: Effect.Effect<A, E>): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) {
    return exit.value
  }
  throw Cause.squash(exit.cause)
}
