import {
  DiskSpace,
  Episode,
  Health,
  QualityProfile,
  Series,
  Sonarr,
  type SonarrError,
  type SonarrService,
  SystemStatus,
  Tag,
} from "@trugamr/sonarr/effect"
import { Tool, Toolkit } from "@effect/ai"
import { Context, Effect, Either, Encoding, Schema } from "effect"

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

// ---------------------------------------------------------------------------
// Query surface for the list tools — filter / sort / paginate, applied
// client-side because Sonarr's `/series` and `/episode` endpoints return a flat
// array with no server-side query support. The shapes below model a structured,
// MCP-native query (typed JSON, no URL-style brackets) with explicit per-field
// operators, so the generated `inputSchema` stays nested objects + enums (no
// `anyOf` unions).
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const SortOrder = Schema.Literal("asc", "desc")

/** Equality + set membership operators over a value type. */
const Eq = <A, I>(s: Schema.Schema<A, I>) =>
  Schema.Struct({
    eq: Schema.optional(s),
    ne: Schema.optional(s),
    in: Schema.optional(Schema.Array(s)),
    nin: Schema.optional(Schema.Array(s)),
  })
/** Ordered operators = equality/set + range comparisons (numbers, ISO-date strings). */
const Ord = <A, I>(s: Schema.Schema<A, I>) =>
  Schema.Struct({
    eq: Schema.optional(s),
    ne: Schema.optional(s),
    in: Schema.optional(Schema.Array(s)),
    nin: Schema.optional(Schema.Array(s)),
    gte: Schema.optional(s),
    lte: Schema.optional(s),
    gt: Schema.optional(s),
    lt: Schema.optional(s),
  })
/** Text operators. `contains` is a case-insensitive substring match. */
const Text = Schema.Struct({
  eq: Schema.optional(Schema.String),
  ne: Schema.optional(Schema.String),
  contains: Schema.optional(Schema.String),
  in: Schema.optional(Schema.Array(Schema.String)),
})
/** Boolean operator. */
const Bool = Schema.Struct({ eq: Schema.optional(Schema.Boolean) })
/** Array-membership operators, for fields like `tags[]` / `genres[]`. */
const Has = <A, I>(s: Schema.Schema<A, I>) =>
  Schema.Struct({
    hasAny: Schema.optional(Schema.Array(s)),
    hasAll: Schema.optional(Schema.Array(s)),
  })

// Operator-object value types mirror what `Schema.optional` produces — each
// property is optional *and* may be `undefined` (the repo runs with
// `exactOptionalPropertyTypes`, so the two are distinct and must match).
type EqOp<T> = {
  readonly eq?: T | undefined
  readonly ne?: T | undefined
  readonly in?: ReadonlyArray<T> | undefined
  readonly nin?: ReadonlyArray<T> | undefined
}
type OrdOp<T> = EqOp<T> & {
  readonly gte?: T | undefined
  readonly lte?: T | undefined
  readonly gt?: T | undefined
  readonly lt?: T | undefined
}
type TextOp = {
  readonly eq?: string | undefined
  readonly ne?: string | undefined
  readonly contains?: string | undefined
  readonly in?: ReadonlyArray<string> | undefined
}
type HasOp<T> = {
  readonly hasAny?: ReadonlyArray<T> | undefined
  readonly hasAll?: ReadonlyArray<T> | undefined
}

// Each matcher returns true when the value satisfies every present operator (an
// absent operator is a no-op). Written as boolean expressions so a missing filter
// or operator simply short-circuits to `true`.
const matchEq = <T>(v: T, f?: EqOp<T>) =>
  !f ||
  ((f.eq === undefined || v === f.eq) &&
    (f.ne === undefined || v !== f.ne) &&
    (f.in === undefined || f.in.includes(v)) &&
    (f.nin === undefined || !f.nin.includes(v)))
// A null/absent value fails any present ordered constraint.
const matchOrd = <T extends string | number>(v: T | null | undefined, f?: OrdOp<T>) =>
  !f ||
  (v != null &&
    matchEq(v, f) &&
    (f.gte === undefined || v >= f.gte) &&
    (f.lte === undefined || v <= f.lte) &&
    (f.gt === undefined || v > f.gt) &&
    (f.lt === undefined || v < f.lt))
const matchText = (v: string | null | undefined, f?: TextOp) => {
  const s = v ?? ""
  return (
    !f ||
    ((f.eq === undefined || s === f.eq) &&
      (f.ne === undefined || s !== f.ne) &&
      (f.contains === undefined || s.toLowerCase().includes(f.contains.toLowerCase())) &&
      (f.in === undefined || f.in.includes(s)))
  )
}
const matchBool = (v: boolean, f?: { readonly eq?: boolean | undefined }) =>
  !f || f.eq === undefined || v === f.eq
const matchHas = <T>(vals: ReadonlyArray<T>, f?: HasOp<T>) =>
  !f ||
  ((f.hasAny === undefined || f.hasAny.some((x) => vals.includes(x))) &&
    (f.hasAll === undefined || f.hasAll.every((x) => vals.includes(x))))

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(Math.trunc(Number.isFinite(n) ? n : lo), lo), hi)
/** Compose comparators: the first non-zero result wins (multi-field sort). */
const combine =
  <A>(cmps: ReadonlyArray<(x: A, y: A) => number>) =>
  (x: A, y: A) => {
    for (const c of cmps) {
      const r = c(x, y)
      if (r !== 0) {
        return r
      }
    }
    return 0
  }
const compareBy =
  <A>(key: (a: A) => string | number, order: "asc" | "desc") =>
  (x: A, y: A) => {
    const a = key(x)
    const b = key(y)
    const c = a < b ? -1 : a > b ? 1 : 0
    return order === "asc" ? c : -c
  }

/** Pagination input: `page[size]` (a hint, clamped) + `page[cursor]` (opaque). */
const PageInput = Schema.Struct({
  size: Schema.optional(Schema.Number),
  cursor: Schema.optional(Schema.String),
})
type PageInputValue = Schema.Schema.Type<typeof PageInput>

/** Result envelope, MCP cursor style: `nextCursor` is absent on the last page. */
const CursorPage = <A, I>(item: Schema.Schema<A, I>) =>
  Schema.Struct({
    items: Schema.Array(item),
    nextCursor: Schema.optional(Schema.String),
    totalRecords: Schema.Number,
  })

// The opaque cursor encodes the next offset as base64url JSON. Clients must treat
// it as opaque; the offset is meaningful only against the same filter+sort, and a
// default sort keeps it stable across calls.
const encodeCursor = (offset: number) => Encoding.encodeBase64Url(JSON.stringify({ o: offset }))
/** Decode a cursor to its offset; an unparseable cursor fails as a tool error. */
const decodeCursor = (
  cursor?: string,
): Effect.Effect<number, { _tag: string; message: string }> => {
  if (cursor === undefined) {
    return Effect.succeed(0)
  }
  return Effect.try({
    try: () => {
      const json = Either.getOrThrowWith(
        Encoding.decodeBase64UrlString(cursor),
        () => new Error("invalid base64url"),
      )
      const o = (JSON.parse(json) as { o: unknown }).o
      if (typeof o !== "number" || !Number.isInteger(o) || o < 0) {
        throw new Error("bad offset")
      }
      return o
    },
    catch: () => ({ _tag: "InvalidCursor", message: `Invalid pagination cursor: ${cursor}` }),
  })
}

/** Slice an already-filtered/sorted array at `offset` and project the page items. */
const pageByCursor = <A, B>(
  all: ReadonlyArray<A>,
  offset: number,
  size: number | undefined,
  project: (a: A) => B,
) => {
  const totalRecords = all.length
  const pageSize = clamp(size ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
  const start = clamp(offset, 0, totalRecords)
  const slice = all.slice(start, start + pageSize)
  const next = start + slice.length
  return {
    items: slice.map(project),
    totalRecords,
    ...(next < totalRecords ? { nextCursor: encodeCursor(next) } : {}),
  }
}

// --- Series query ----------------------------------------------------------

// Lean list projection. The heavy `seasons[]`/`statistics`/`ratings` blocks are
// dropped; full detail is available through `get_series`. Derived from the SDK
// `Series` so field types track the source schema.
const SeriesSummary = Series.pick(
  "id",
  "title",
  "year",
  "status",
  "monitored",
  "tvdbId",
  "qualityProfileId",
  "network",
  "seriesType",
  "path",
)
type SeriesSummary = Schema.Schema.Type<typeof SeriesSummary>

const toSeriesSummary = (s: Series): SeriesSummary => ({
  id: s.id,
  title: s.title,
  year: s.year,
  status: s.status,
  monitored: s.monitored,
  tvdbId: s.tvdbId,
  qualityProfileId: s.qualityProfileId,
  seriesType: s.seriesType,
  ...(s.network !== undefined ? { network: s.network } : {}),
  ...(s.path !== undefined ? { path: s.path } : {}),
})

const seriesSortKey: Record<"title" | "year" | "added", (s: Series) => string | number> = {
  title: (s) => s.title.toLowerCase(),
  year: (s) => s.year,
  added: (s) => s.added, // ISO 8601 string sorts chronologically
}

const SeriesFilter = Schema.Struct({
  title: Schema.optional(
    Text.annotations({ description: "Match the series title (text operators)." }),
  ),
  status: Schema.optional(
    Eq(Schema.String).annotations({ description: "continuing | ended | upcoming | deleted" }),
  ),
  seriesType: Schema.optional(
    Eq(Schema.String).annotations({ description: "standard | daily | anime" }),
  ),
  monitored: Schema.optional(Bool.annotations({ description: "Whether the series is monitored." })),
  qualityProfileId: Schema.optional(
    Eq(Schema.Number).annotations({ description: "Quality profile id." }),
  ),
  tag: Schema.optional(Has(Schema.Number).annotations({ description: "Tag ids on the series." })),
  network: Schema.optional(
    Text.annotations({ description: "Match the network (text operators)." }),
  ),
  genre: Schema.optional(Has(Schema.String).annotations({ description: "Genres on the series." })),
  year: Schema.optional(
    Ord(Schema.Number).annotations({ description: "Release year (range ops)." }),
  ),
})
type SeriesFilterValue = Schema.Schema.Type<typeof SeriesFilter>
const SeriesSort = Schema.Array(
  Schema.Struct({
    field: Schema.Literal("title", "year", "added"),
    order: Schema.optional(SortOrder),
  }),
)
type SeriesSortValue = Schema.Schema.Type<typeof SeriesSort>

const matchesSeries = (s: Series, f: SeriesFilterValue = {}) =>
  matchText(s.title, f.title) &&
  matchEq(s.status, f.status) &&
  matchEq(s.seriesType, f.seriesType) &&
  matchBool(s.monitored, f.monitored) &&
  matchEq(s.qualityProfileId, f.qualityProfileId) &&
  matchHas(s.tags, f.tag) &&
  matchText(s.network, f.network) &&
  matchHas(s.genres ?? [], f.genre) &&
  matchOrd(s.year, f.year)

const seriesComparator = (sort: SeriesSortValue = []) =>
  combine(
    (sort.length ? sort : [{ field: "title" as const }]).map((s) =>
      compareBy(seriesSortKey[s.field], s.order ?? "asc"),
    ),
  )

// --- Episode query ---------------------------------------------------------

// The SDK `Episode` carries no heavy nested blocks, so the episode list needs no
// `include` — the summary keeps `overview` (no get_episode tool to recover it).
const EpisodeSummary = Episode.pick(
  "id",
  "seriesId",
  "seasonNumber",
  "episodeNumber",
  "title",
  "airDate",
  "hasFile",
  "monitored",
  "overview",
)
type EpisodeSummary = Schema.Schema.Type<typeof EpisodeSummary>

const toEpisodeSummary = (e: Episode): EpisodeSummary => ({
  id: e.id,
  seriesId: e.seriesId,
  seasonNumber: e.seasonNumber,
  episodeNumber: e.episodeNumber,
  hasFile: e.hasFile,
  monitored: e.monitored,
  ...(e.title !== undefined ? { title: e.title } : {}),
  ...(e.airDate !== undefined ? { airDate: e.airDate } : {}),
  ...(e.overview !== undefined ? { overview: e.overview } : {}),
})

const EpisodeFilter = Schema.Struct({
  title: Schema.optional(
    Text.annotations({ description: "Match the episode title (text operators)." }),
  ),
  monitored: Schema.optional(
    Bool.annotations({ description: "Whether the episode is monitored." }),
  ),
  hasFile: Schema.optional(Bool.annotations({ description: "Whether a file is present." })),
  missing: Schema.optional(
    Schema.Boolean.annotations({ description: "Convenience: monitored and without a file." }),
  ),
  airDate: Schema.optional(
    Ord(Schema.String).annotations({ description: "Air date (UTC ISO) range operators." }),
  ),
  hasAired: Schema.optional(
    Schema.Boolean.annotations({ description: "Convenience: air date is in the past." }),
  ),
})
type EpisodeFilterValue = Schema.Schema.Type<typeof EpisodeFilter>
const EpisodeSort = Schema.Array(
  Schema.Struct({ field: Schema.Literal("episode", "airDate"), order: Schema.optional(SortOrder) }),
)
type EpisodeSortValue = Schema.Schema.Type<typeof EpisodeSort>

const episodeAired = (e: Episode) => e.airDateUtc != null && Date.parse(e.airDateUtc) <= Date.now()

const matchesEpisode = (e: Episode, f: EpisodeFilterValue = {}) =>
  matchText(e.title, f.title) &&
  matchBool(e.monitored, f.monitored) &&
  matchBool(e.hasFile, f.hasFile) &&
  (f.missing === undefined || f.missing === (e.monitored && !e.hasFile)) &&
  matchOrd(e.airDateUtc, f.airDate) &&
  (f.hasAired === undefined || f.hasAired === episodeAired(e))

const compareEpisodeField = (field: "episode" | "airDate", order: "asc" | "desc") =>
  field === "airDate"
    ? (x: Episode, y: Episode) => {
        // Sort by UTC air date, nulls last regardless of direction.
        const ax = x.airDateUtc
        const ay = y.airDateUtc
        if (ax == null || ay == null) {
          return ax == null ? (ay == null ? 0 : 1) : -1
        }
        const c = ax < ay ? -1 : ax > ay ? 1 : 0
        return order === "asc" ? c : -c
      }
    : (x: Episode, y: Episode) => {
        const c = x.seasonNumber - y.seasonNumber || x.episodeNumber - y.episodeNumber
        return order === "asc" ? c : -c
      }

const episodeComparator = (sort: EpisodeSortValue = []) =>
  combine(
    (sort.length ? sort : [{ field: "episode" as const }]).map((s) =>
      compareEpisodeField(s.field, s.order ?? "asc"),
    ),
  )

// ---------------------------------------------------------------------------

const GetSystemStatus = Tool.make("get_system_status", {
  description:
    "Get the Sonarr instance status — version, runtime, OS, database, and authentication info.",
  success: SystemStatus,
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListSeries = Tool.make("list_series", {
  description:
    "List series as lean summaries; filter, sort, and paginate (opaque cursor). " +
    "Call get_series for full detail (seasons, statistics, ratings).",
  parameters: {
    filter: Schema.optional(SeriesFilter),
    sort: Schema.optional(SeriesSort),
    page: Schema.optional(PageInput),
  },
  success: CursorPage(SeriesSummary),
  failure: ToolError,
}).annotateContext(readonlyHints)

const GetSeries = Tool.make("get_series", {
  description: "Get a single series by its Sonarr id.",
  parameters: { seriesId: Schema.Number },
  success: Series,
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListEpisodes = Tool.make("list_episodes", {
  description:
    "List episodes for a series (optionally one season) as lean summaries; filter, sort, " +
    "and paginate (opaque cursor).",
  parameters: {
    seriesId: Schema.Number,
    seasonNumber: Schema.optional(Schema.Number),
    filter: Schema.optional(EpisodeFilter),
    sort: Schema.optional(EpisodeSort),
    page: Schema.optional(PageInput),
  },
  success: CursorPage(EpisodeSummary),
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListQualityProfiles = Tool.make("list_quality_profiles", {
  description: "List Sonarr quality profiles.",
  success: ListResult(QualityProfile),
  failure: ToolError,
}).annotateContext(readonlyHints)

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

export interface SeriesListArgs {
  readonly filter?: SeriesFilterValue | undefined
  readonly sort?: SeriesSortValue | undefined
  readonly page?: PageInputValue | undefined
}

export interface EpisodeListArgs {
  readonly seriesId: number
  readonly seasonNumber?: number | undefined
  readonly filter?: EpisodeFilterValue | undefined
  readonly sort?: EpisodeSortValue | undefined
  readonly page?: PageInputValue | undefined
}

export const getSystemStatus = (sonarr: SonarrService) => handle(sonarr.system.getStatus)

export const listSeries = (sonarr: SonarrService, p: SeriesListArgs = {}) =>
  decodeCursor(p.page?.cursor).pipe(
    Effect.flatMap((offset) =>
      handle(sonarr.series.list).pipe(
        Effect.map((all) => {
          const filtered = all.filter((s) => matchesSeries(s, p.filter))
          const sorted = filtered.toSorted(seriesComparator(p.sort))
          return pageByCursor(sorted, offset, p.page?.size, toSeriesSummary)
        }),
      ),
    ),
  )

export const getSeries = (sonarr: SonarrService, seriesId: number) =>
  handle(sonarr.series.get(seriesId))

export const listEpisodes = (sonarr: SonarrService, p: EpisodeListArgs) =>
  decodeCursor(p.page?.cursor).pipe(
    Effect.flatMap((offset) =>
      handle(sonarr.episode.list({ seriesId: p.seriesId, seasonNumber: p.seasonNumber })).pipe(
        Effect.map((all) => {
          const filtered = all.filter((e) => matchesEpisode(e, p.filter))
          const sorted = filtered.toSorted(episodeComparator(p.sort))
          return pageByCursor(sorted, offset, p.page?.size, toEpisodeSummary)
        }),
      ),
    ),
  )

export const listQualityProfiles = (sonarr: SonarrService) => handleList(sonarr.qualityProfile.list)

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
      list_series: (params) => listSeries(sonarr, params),
      get_series: ({ seriesId }) => getSeries(sonarr, seriesId),
      list_episodes: (params) => listEpisodes(sonarr, params),
      list_quality_profiles: () => listQualityProfiles(sonarr),
      list_tags: () => listTags(sonarr),
      create_tag: ({ label }) => createTag(sonarr, label),
      delete_tag: ({ tagId }) => deleteTag(sonarr, tagId),
      list_health: () => listHealth(sonarr),
      list_disk_space: () => listDiskSpace(sonarr),
    }
  }),
)
