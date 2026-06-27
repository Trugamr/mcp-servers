import {
  DiskSpace,
  Episode,
  type EpisodeListParams,
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
 * Success schema for a list tool. MCP structured content must be a JSON object,
 * never a bare array, so list results are wrapped as `{ items }`.
 */
const ListResult = <A, I>(item: Schema.Schema<A, I>) => Schema.Struct({ items: Schema.Array(item) })

/**
 * Surface a typed `SonarrError` as a JSON-serializable tool error. The message
 * is owned by the error itself, so this stays tag-agnostic as error types grow.
 */
const toToolError = (error: SonarrError) => ({ _tag: error._tag, message: error.message })

// MCP safety hints, applied per tool via `annotateContext`. `OpenWorld` is always
// false — every call reaches one configured Sonarr instance, nothing beyond it.
const hints = (annotations: { readonly readonly: boolean; readonly destructive: boolean }) =>
  Context.empty().pipe(
    Context.add(Tool.Readonly, annotations.readonly),
    Context.add(Tool.Destructive, annotations.destructive),
    Context.add(Tool.OpenWorld, false),
  )
const readonlyHints = hints({ readonly: true, destructive: false })
const writeHints = hints({ readonly: false, destructive: false })
const destructiveHints = hints({ readonly: false, destructive: true })

const GetSystemStatus = Tool.make("get_system_status", {
  description:
    "Get the Sonarr instance status — version, runtime, OS, database, and authentication info.",
  success: SystemStatus,
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListSeries = Tool.make("list_series", {
  description: "List all series in the Sonarr library.",
  success: ListResult(Series),
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
  success: ListResult(Episode),
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListQualityProfiles = Tool.make("list_quality_profiles", {
  description: "List Sonarr quality profiles.",
  success: ListResult(QualityProfile),
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListRootFolders = Tool.make("list_root_folders", {
  description: "List configured root folders and their free space.",
  success: ListResult(RootFolder),
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
  success: ListResult(Tag),
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
  success: ListResult(Health),
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListDiskSpace = Tool.make("list_disk_space", {
  description: "List free and total disk space for Sonarr-visible mounts.",
  success: ListResult(DiskSpace),
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

/** Run a Sonarr operation, surfacing its `SonarrError` as the tool-error shape. */
const handle = <A>(effect: Effect.Effect<A, SonarrError>) =>
  effect.pipe(Effect.mapError(toToolError))

/**
 * Run a Sonarr list operation, wrapping the array as `{ items }` so the tool's
 * structured output is a JSON object — MCP rejects a bare array there.
 */
const handleList = <A>(effect: Effect.Effect<ReadonlyArray<A>, SonarrError>) =>
  handle(effect).pipe(Effect.map((items) => ({ items })))

export const getSystemStatus = (sonarr: SonarrService) => handle(sonarr.system.getStatus)

export const listSeries = (sonarr: SonarrService) => handleList(sonarr.series.list)

export const getSeries = (sonarr: SonarrService, seriesId: number) =>
  handle(sonarr.series.get(seriesId))

export const listEpisodes = (sonarr: SonarrService, params: EpisodeListParams) =>
  handleList(sonarr.episode.list(params))

export const listQualityProfiles = (sonarr: SonarrService) => handleList(sonarr.qualityProfile.list)

export const listRootFolders = (sonarr: SonarrService) => handleList(sonarr.rootFolder.list)

export const addRootFolder = (sonarr: SonarrService, path: string) =>
  handle(sonarr.rootFolder.add(path))

export const deleteRootFolder = (sonarr: SonarrService, id: number) =>
  handle(sonarr.rootFolder.delete(id))

export const listTags = (sonarr: SonarrService) => handleList(sonarr.tag.list)

export const createTag = (sonarr: SonarrService, label: string) => handle(sonarr.tag.create(label))

export const deleteTag = (sonarr: SonarrService, id: number) => handle(sonarr.tag.delete(id))

export const listHealth = (sonarr: SonarrService) => handleList(sonarr.health.list)

export const listDiskSpace = (sonarr: SonarrService) => handleList(sonarr.diskSpace.list)

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
