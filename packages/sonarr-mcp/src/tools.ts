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
import { Context, Effect, Encoding, Order, Predicate, Schema } from "effect"

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

// Structured query surface for the list tools: filter / sort / paginate, applied
// client-side because Sonarr's `/series` and `/episode` return flat arrays with no
// query support. Explicit per-field operators keep the inputSchema free of `anyOf`.
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
/**
 * Single-value scope filter — only `eq`. For relationship-scope fields (e.g.
 * `series.id`, `season.number`) that map to Sonarr query params, which accept one
 * value with no ranges or set membership.
 */
const ScopeEq = <A, I>(s: Schema.Schema<A, I>) => Schema.Struct({ eq: s })

// Operator-object value types are derived from the schema builders, so the
// matchers can't drift from the schemas they validate against.
type EqOp<A> = Schema.Schema.Type<ReturnType<typeof Eq<A, A>>>
type OrdOp<A> = Schema.Schema.Type<ReturnType<typeof Ord<A, A>>>
type TextOp = Schema.Schema.Type<typeof Text>
type BoolOp = Schema.Schema.Type<typeof Bool>

// Each matcher returns true when the value satisfies every present operator (an
// absent operator is a no-op), so a missing filter short-circuits to `true`.
const matchEquality = <T>(value: T, operators?: EqOp<T>) =>
  !operators ||
  ((Predicate.isUndefined(operators.eq) || value === operators.eq) &&
    (Predicate.isUndefined(operators.ne) || value !== operators.ne) &&
    (Predicate.isUndefined(operators.in) || operators.in.includes(value)) &&
    (Predicate.isUndefined(operators.nin) || !operators.nin.includes(value)))
// A null/absent value fails any present ordered constraint.
const matchOrdered = <T extends string | number>(
  value: T | null | undefined,
  operators?: OrdOp<T>,
) =>
  !operators ||
  (Predicate.isNotNullable(value) &&
    matchEquality(value, operators) &&
    (Predicate.isUndefined(operators.gte) || value >= operators.gte) &&
    (Predicate.isUndefined(operators.lte) || value <= operators.lte) &&
    (Predicate.isUndefined(operators.gt) || value > operators.gt) &&
    (Predicate.isUndefined(operators.lt) || value < operators.lt))
const matchText = (value: string | null | undefined, operators?: TextOp) => {
  const text = value ?? ""
  return (
    !operators ||
    ((Predicate.isUndefined(operators.eq) || text === operators.eq) &&
      (Predicate.isUndefined(operators.ne) || text !== operators.ne) &&
      (Predicate.isUndefined(operators.contains) ||
        text.toLowerCase().includes(operators.contains.toLowerCase())) &&
      (Predicate.isUndefined(operators.in) || operators.in.includes(text)))
  )
}
const matchBoolean = (value: boolean, operators?: BoolOp) =>
  !operators || Predicate.isUndefined(operators.eq) || value === operators.eq

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(Math.trunc(Number.isFinite(n) ? n : lo), lo), hi)

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

// The opaque cursor is a base64url-encoded `{ offset }` JSON object. Clients must
// treat it as opaque; the offset is meaningful only against the same filter+sort,
// and a default sort keeps it stable across calls.
const Cursor = Schema.parseJson(Schema.Struct({ offset: Schema.NonNegativeInt }))
const encodeCursor = (offset: number) =>
  Encoding.encodeBase64Url(Schema.encodeSync(Cursor)({ offset }))
/** Decode a cursor to its offset; an invalid cursor fails as a tool error. */
const decodeCursor = (cursor?: string): Effect.Effect<number, { _tag: string; message: string }> =>
  Predicate.isNotUndefined(cursor)
    ? Encoding.decodeBase64UrlString(cursor).pipe(
        Effect.flatMap(Schema.decode(Cursor)),
        Effect.map((decoded) => decoded.offset),
        Effect.mapError(() => ({
          _tag: "InvalidCursor",
          message: `Invalid pagination cursor: ${cursor}`,
        })),
      )
    : Effect.succeed(0)

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
    ...(next < totalRecords && { nextCursor: encodeCursor(next) }),
  }
}

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
  ...(Predicate.isNotUndefined(s.network) && { network: s.network }),
  ...(Predicate.isNotUndefined(s.path) && { path: s.path }),
})

const seriesOrders: Record<"title" | "year" | "added", Order.Order<Series>> = {
  title: Order.mapInput(Order.string, (s: Series) => s.title.toLowerCase()),
  year: Order.mapInput(Order.number, (s: Series) => s.year),
  added: Order.mapInput(Order.string, (s: Series) => s.added), // ISO 8601 sorts chronologically
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
  network: Schema.optional(
    Text.annotations({ description: "Match the network (text operators)." }),
  ),
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
  matchEquality(s.status, f.status) &&
  matchEquality(s.seriesType, f.seriesType) &&
  matchBoolean(s.monitored, f.monitored) &&
  matchEquality(s.qualityProfileId, f.qualityProfileId) &&
  matchText(s.network, f.network) &&
  matchOrdered(s.year, f.year)

const seriesOrder = (sort: SeriesSortValue = []) =>
  Order.combineAll(
    (sort.length ? sort : [{ field: "title" as const }]).map((s) =>
      s.order === "desc" ? Order.reverse(seriesOrders[s.field]) : seriesOrders[s.field],
    ),
  )

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
  ...(Predicate.isNotUndefined(e.title) && { title: e.title }),
  ...(Predicate.isNotUndefined(e.airDate) && { airDate: e.airDate }),
  ...(Predicate.isNotUndefined(e.overview) && { overview: e.overview }),
})

const EpisodeFilter = Schema.Struct({
  "series.id": ScopeEq(Schema.Number).annotations({
    description: "Series whose episodes to fetch (required; sent to Sonarr as seriesId).",
  }),
  "season.number": Schema.optional(
    ScopeEq(Schema.Number).annotations({
      description: "Restrict to one season (sent to Sonarr as seasonNumber).",
    }),
  ),
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

const episodeAired = (e: Episode) =>
  Predicate.isNotNullable(e.airDateUtc) && Date.parse(e.airDateUtc) <= Date.now()

// `series.id`/`season.number` scope the Sonarr fetch, so they're applied
// server-side, not here — this narrows the fetched episodes by the remaining fields.
const matchesEpisode = (e: Episode, f: EpisodeFilterValue) =>
  matchText(e.title, f.title) &&
  matchBoolean(e.monitored, f.monitored) &&
  matchBoolean(e.hasFile, f.hasFile) &&
  (Predicate.isUndefined(f.missing) || f.missing === (e.monitored && !e.hasFile)) &&
  matchOrdered(e.airDateUtc, f.airDate) &&
  (Predicate.isUndefined(f.hasAired) || f.hasAired === episodeAired(e))

const byEpisodeNumber: Order.Order<Episode> = Order.combine(
  Order.mapInput(Order.number, (e: Episode) => e.seasonNumber),
  Order.mapInput(Order.number, (e: Episode) => e.episodeNumber),
)
// Sort by UTC air date, nulls last regardless of direction.
const byAirDate =
  (order: "asc" | "desc"): Order.Order<Episode> =>
  (x, y) => {
    const ax = x.airDateUtc
    const ay = y.airDateUtc
    if (Predicate.isNullable(ax) || Predicate.isNullable(ay)) {
      // false (present) sorts before true (absent), so nulls land last.
      return Order.boolean(Predicate.isNullable(ax), Predicate.isNullable(ay))
    }
    return order === "asc" ? Order.string(ax, ay) : Order.string(ay, ax)
  }

const episodeFieldOrder = (
  field: "episode" | "airDate",
  order: "asc" | "desc",
): Order.Order<Episode> =>
  field === "airDate"
    ? byAirDate(order)
    : order === "desc"
      ? Order.reverse(byEpisodeNumber)
      : byEpisodeNumber

const episodeOrder = (sort: EpisodeSortValue = []) =>
  Order.combineAll(
    (sort.length ? sort : [{ field: "episode" as const }]).map((s) =>
      episodeFieldOrder(s.field, s.order ?? "asc"),
    ),
  )

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
    "and paginate (opaque cursor). filter['series.id'] is required and scopes the Sonarr " +
    "fetch (with optional filter['season.number']); the remaining filters narrow the " +
    "fetched episodes client-side.",
  parameters: {
    filter: EpisodeFilter,
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
  readonly filter: EpisodeFilterValue
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
          const sorted = filtered.toSorted(seriesOrder(p.sort))
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
      handle(
        sonarr.episode.list({
          seriesId: p.filter["series.id"].eq,
          seasonNumber: p.filter["season.number"]?.eq,
        }),
      ).pipe(
        Effect.map((all) => {
          const filtered = all.filter((e) => matchesEpisode(e, p.filter))
          const sorted = filtered.toSorted(episodeOrder(p.sort))
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
