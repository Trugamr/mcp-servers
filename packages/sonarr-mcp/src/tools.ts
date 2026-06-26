import {
  DiskSpace,
  Episode,
  Health,
  QualityProfile,
  RootFolder,
  Series,
  Sonarr,
  type SonarrError,
  type SonarrService,
  SystemStatus,
  Tag,
} from "@trugamr/sonarr/effect"
import { Tool, Toolkit } from "@effect/ai"
import { Context, Effect, Schema } from "effect"

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

// MCP safety hints, applied per tool via `annotateContext`. `OpenWorld` is always
// false — every call reaches one configured Sonarr instance, nothing beyond it.
// The three contexts cover the combinations this surface uses: read-only,
// state-changing-but-non-destructive, and destructive (removes data).
const readonlyHints = Context.empty().pipe(
  Context.add(Tool.Readonly, true),
  Context.add(Tool.Destructive, false),
  Context.add(Tool.OpenWorld, false),
)
const writeHints = Context.empty().pipe(
  Context.add(Tool.Readonly, false),
  Context.add(Tool.Destructive, false),
  Context.add(Tool.OpenWorld, false),
)
const destructiveHints = Context.empty().pipe(
  Context.add(Tool.Readonly, false),
  Context.add(Tool.Destructive, true),
  Context.add(Tool.OpenWorld, false),
)

const GetSystemStatus = Tool.make("get_system_status", {
  description:
    "Get the Sonarr instance status — version, runtime, OS, database, and authentication info.",
  success: SystemStatus,
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListSeries = Tool.make("list_series", {
  description: "List all series in the Sonarr library.",
  success: Schema.Array(Series),
  failure: ToolError,
}).annotateContext(readonlyHints)

const GetSeries = Tool.make("get_series", {
  description: "Get a single series by its Sonarr id.",
  parameters: { seriesId: Schema.Number },
  success: Series,
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListEpisodes = Tool.make("list_episodes", {
  description: "List episodes for a series, optionally filtered to a single season.",
  parameters: { seriesId: Schema.Number, seasonNumber: Schema.optional(Schema.Number) },
  success: Schema.Array(Episode),
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListQualityProfiles = Tool.make("list_quality_profiles", {
  description: "List Sonarr quality profiles.",
  success: Schema.Array(QualityProfile),
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListRootFolders = Tool.make("list_root_folders", {
  description: "List configured root folders and their free space.",
  success: Schema.Array(RootFolder),
  failure: ToolError,
}).annotateContext(readonlyHints)

const AddRootFolder = Tool.make("add_root_folder", {
  description: "Register a new root folder by absolute path.",
  parameters: { path: Schema.String },
  success: RootFolder,
  failure: ToolError,
}).annotateContext(writeHints)

const DeleteRootFolder = Tool.make("delete_root_folder", {
  description: "Delete a root folder by its id.",
  parameters: { rootFolderId: Schema.Number },
  success: Schema.Void,
  failure: ToolError,
}).annotateContext(destructiveHints)

const ListTags = Tool.make("list_tags", {
  description: "List Sonarr tags.",
  success: Schema.Array(Tag),
  failure: ToolError,
}).annotateContext(readonlyHints)

const CreateTag = Tool.make("create_tag", {
  description: "Create a tag with the given label.",
  parameters: { label: Schema.String },
  success: Tag,
  failure: ToolError,
}).annotateContext(writeHints)

const DeleteTag = Tool.make("delete_tag", {
  description: "Delete a tag by its id.",
  parameters: { tagId: Schema.Number },
  success: Schema.Void,
  failure: ToolError,
}).annotateContext(destructiveHints)

const ListHealth = Tool.make("list_health", {
  description: "List active Sonarr health-check messages.",
  success: Schema.Array(Health),
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListDiskSpace = Tool.make("list_disk_space", {
  description: "List free and total disk space for Sonarr-visible mounts.",
  success: Schema.Array(DiskSpace),
  failure: ToolError,
}).annotateContext(readonlyHints)

export const SonarrToolkit = Toolkit.make(
  GetSystemStatus,
  ListSeries,
  GetSeries,
  ListEpisodes,
  ListQualityProfiles,
  ListRootFolders,
  AddRootFolder,
  DeleteRootFolder,
  ListTags,
  CreateTag,
  DeleteTag,
  ListHealth,
  ListDiskSpace,
)

// Handlers in isolation: call the Sonarr client and map `SonarrError` to the
// tool-error shape. Exported so unit tests can drive them directly.

export const getSystemStatus = (sonarr: SonarrService) =>
  sonarr.system.getStatus.pipe(Effect.mapError(toToolError))

export const listSeries = (sonarr: SonarrService) =>
  sonarr.series.list.pipe(Effect.mapError(toToolError))

export const getSeries = (sonarr: SonarrService, seriesId: number) =>
  sonarr.series.get(seriesId).pipe(Effect.mapError(toToolError))

export const listEpisodes = (
  sonarr: SonarrService,
  params: { readonly seriesId: number; readonly seasonNumber?: number | undefined },
) => sonarr.episode.list(params).pipe(Effect.mapError(toToolError))

export const listQualityProfiles = (sonarr: SonarrService) =>
  sonarr.qualityProfile.list.pipe(Effect.mapError(toToolError))

export const listRootFolders = (sonarr: SonarrService) =>
  sonarr.rootFolder.list.pipe(Effect.mapError(toToolError))

export const addRootFolder = (sonarr: SonarrService, path: string) =>
  sonarr.rootFolder.add(path).pipe(Effect.mapError(toToolError))

export const deleteRootFolder = (sonarr: SonarrService, id: number) =>
  sonarr.rootFolder.delete(id).pipe(Effect.mapError(toToolError))

export const listTags = (sonarr: SonarrService) =>
  sonarr.tag.list.pipe(Effect.mapError(toToolError))

export const createTag = (sonarr: SonarrService, label: string) =>
  sonarr.tag.create(label).pipe(Effect.mapError(toToolError))

export const deleteTag = (sonarr: SonarrService, id: number) =>
  sonarr.tag.delete(id).pipe(Effect.mapError(toToolError))

export const listHealth = (sonarr: SonarrService) =>
  sonarr.health.list.pipe(Effect.mapError(toToolError))

export const listDiskSpace = (sonarr: SonarrService) =>
  sonarr.diskSpace.list.pipe(Effect.mapError(toToolError))

/** Toolkit handlers, reading the Sonarr client from context. */
export const SonarrToolkitLive = SonarrToolkit.toLayer(
  Effect.gen(function* () {
    const sonarr = yield* Sonarr
    return {
      get_system_status: () => getSystemStatus(sonarr),
      list_series: () => listSeries(sonarr),
      get_series: ({ seriesId }) => getSeries(sonarr, seriesId),
      list_episodes: ({ seriesId, seasonNumber }) =>
        listEpisodes(sonarr, { seriesId, seasonNumber }),
      list_quality_profiles: () => listQualityProfiles(sonarr),
      list_root_folders: () => listRootFolders(sonarr),
      add_root_folder: ({ path }) => addRootFolder(sonarr, path),
      delete_root_folder: ({ rootFolderId }) => deleteRootFolder(sonarr, rootFolderId),
      list_tags: () => listTags(sonarr),
      create_tag: ({ label }) => createTag(sonarr, label),
      delete_tag: ({ tagId }) => deleteTag(sonarr, tagId),
      list_health: () => listHealth(sonarr),
      list_disk_space: () => listDiskSpace(sonarr),
    }
  }),
)
