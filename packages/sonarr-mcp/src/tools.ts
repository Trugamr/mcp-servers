import { Sonarr, type SonarrError, type SonarrService, SystemStatus } from "@trugamr/sonarr/effect"
import { Tool, Toolkit } from "@effect/ai"
import { Effect, Schema } from "effect"

/** Tool-call failure shape returned to the model when a Sonarr call fails. */
const ToolError = Schema.Struct({
  _tag: Schema.String,
  message: Schema.String,
})

/**
 * Surface a typed `SonarrError` as a JSON-serializable tool error. The message
 * is owned by the error itself, so this stays tag-agnostic as error types grow.
 */
const toToolError = (error: SonarrError) => ({ _tag: error._tag, message: error.message })

const GetSystemStatus = Tool.make("get_system_status", {
  description:
    "Get the Sonarr instance status — version, runtime, OS, database, and authentication info.",
  success: SystemStatus,
  failure: ToolError,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false)

export const SonarrToolkit = Toolkit.make(GetSystemStatus)

/**
 * The status handler in isolation: read status from the Sonarr client and map
 * `SonarrError` to the tool-error shape. Exported so unit tests can drive it.
 */
export const getSystemStatus = (sonarr: SonarrService) =>
  sonarr.system.getStatus.pipe(Effect.mapError(toToolError))

/** Toolkit handlers, reading the Sonarr client from context. */
export const SonarrToolkitLive = SonarrToolkit.toLayer(
  Effect.gen(function* () {
    const sonarr = yield* Sonarr
    return {
      get_system_status: () => getSystemStatus(sonarr),
    }
  }),
)
