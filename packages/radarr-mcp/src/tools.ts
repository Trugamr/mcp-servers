import { Tool, Toolkit } from "@effect/ai"
import {
  Movie,
  QueueItem,
  Radarr,
  type RadarrError,
  type RadarrService,
  Release,
  SystemStatus,
} from "@trugamr/radarr/effect"
import { Context, Effect, Encoding, Order, Predicate, Schema } from "effect"

/** Tool-call failure shape returned to the model when a Radarr call fails. */
const ToolError = Schema.Struct({
  _tag: Schema.String,
  message: Schema.String,
})

/** Confirmation echoed back after a grab — the keys grabbed, plus the optional title. */
const GrabResult = Schema.Struct({
  guid: Schema.String,
  indexerId: Schema.Number,
  title: Schema.optional(Schema.String),
})

/**
 * Surface a typed `RadarrError` as a JSON-serializable tool error. The message is
 * owned by the error itself, so this stays tag-agnostic as error types grow.
 */
const toToolError = (error: RadarrError) => ({ _tag: error._tag, message: error.message })

// MCP safety hints, applied per tool via `annotateContext`. `OpenWorld` is true for
// the tools that reach beyond the configured Radarr instance — `search_releases`
// queries external indexers and `grab_release` hands a download to the client.
const hints = (annotations: {
  readonly readonly: boolean
  readonly destructive: boolean
  readonly openWorld: boolean
}) =>
  Context.empty().pipe(
    Context.add(Tool.Readonly, annotations.readonly),
    Context.add(Tool.Destructive, annotations.destructive),
    Context.add(Tool.OpenWorld, annotations.openWorld),
  )
const readonlyHints = hints({ readonly: true, destructive: false, openWorld: false })
const searchHints = hints({ readonly: true, destructive: false, openWorld: true })
const grabHints = hints({ readonly: false, destructive: false, openWorld: true })

// Structured query surface for the list tools: filter / sort / paginate, applied
// client-side because Radarr's `/movie`, `/release`, and `/queue` reads return flat
// lists. Mirrors `@trugamr/sonarr-mcp`'s query layer; the SDK stays a thin wrapper
// over the endpoints, so the richness lives here. Explicit per-field operators keep
// the inputSchema free of `anyOf`.
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

// Operator-object value types are derived from the schema builders, so the matchers
// can't drift from the schemas they validate against.
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

// ---- movie ----------------------------------------------------------------

// Lean list projection: drop the heavy/low-signal fields (overview, sortTitle,
// titleSlug, certification, genres, tags, runtime, …) and keep what identifies and
// ranks a movie. Derived from the SDK `Movie` so field types track the source.
const MovieSummary = Movie.pick(
  "id",
  "title",
  "year",
  "status",
  "monitored",
  "tmdbId",
  "qualityProfileId",
  "hasFile",
  "studio",
  "path",
  "sizeOnDisk",
)
type MovieSummary = Schema.Schema.Type<typeof MovieSummary>

const toMovieSummary = (m: Movie): MovieSummary => ({
  id: m.id,
  title: m.title,
  year: m.year,
  status: m.status,
  monitored: m.monitored,
  tmdbId: m.tmdbId,
  qualityProfileId: m.qualityProfileId,
  hasFile: m.hasFile,
  ...(Predicate.isNotUndefined(m.studio) && { studio: m.studio }),
  ...(Predicate.isNotUndefined(m.path) && { path: m.path }),
  ...(Predicate.isNotUndefined(m.sizeOnDisk) && { sizeOnDisk: m.sizeOnDisk }),
})

const movieOrders: Record<"title" | "year" | "added", Order.Order<Movie>> = {
  title: Order.mapInput(Order.string, (m: Movie) => m.title.toLowerCase()),
  year: Order.mapInput(Order.number, (m: Movie) => m.year),
  added: Order.mapInput(Order.string, (m: Movie) => m.added), // ISO 8601 sorts chronologically
}

const MovieFilter = Schema.Struct({
  title: Schema.optional(
    Text.annotations({ description: "Match the movie title (text operators)." }),
  ),
  status: Schema.optional(
    Eq(Schema.String).annotations({ description: "announced | inCinemas | released | deleted" }),
  ),
  monitored: Schema.optional(Bool.annotations({ description: "Whether the movie is monitored." })),
  hasFile: Schema.optional(Bool.annotations({ description: "Whether a movie file is present." })),
  qualityProfileId: Schema.optional(
    Eq(Schema.Number).annotations({ description: "Quality profile id." }),
  ),
  studio: Schema.optional(Text.annotations({ description: "Match the studio (text operators)." })),
  year: Schema.optional(
    Ord(Schema.Number).annotations({ description: "Release year (range ops)." }),
  ),
})
type MovieFilterValue = Schema.Schema.Type<typeof MovieFilter>
const MovieSort = Schema.Array(
  Schema.Struct({
    field: Schema.Literal("title", "year", "added"),
    order: Schema.optional(SortOrder),
  }),
)
type MovieSortValue = Schema.Schema.Type<typeof MovieSort>

const matchesMovie = (m: Movie, f: MovieFilterValue = {}) =>
  matchText(m.title, f.title) &&
  matchEquality(m.status, f.status) &&
  matchBoolean(m.monitored, f.monitored) &&
  matchBoolean(m.hasFile, f.hasFile) &&
  matchEquality(m.qualityProfileId, f.qualityProfileId) &&
  matchText(m.studio, f.studio) &&
  matchOrdered(m.year, f.year)

const movieOrder = (sort: MovieSortValue = []) =>
  Order.combineAll(
    (sort.length ? sort : [{ field: "title" as const }]).map((s) =>
      s.order === "desc" ? Order.reverse(movieOrders[s.field]) : movieOrders[s.field],
    ),
  )

// ---- release --------------------------------------------------------------

// Codec (HEVC/x265) isn't a structured Radarr field — it's in the title — so a
// caller filters it via `filter.title.contains`. Resolution and quality name come
// from the nested `quality`; missing numerics sort as 0.
const resolutionOf = (r: Release) => r.quality?.quality.resolution
const qualityNameOf = (r: Release) => r.quality?.quality.name

const releaseOrders: Record<
  "seeders" | "size" | "age" | "customFormatScore" | "resolution",
  Order.Order<Release>
> = {
  seeders: Order.mapInput(Order.number, (r: Release) => r.seeders ?? 0),
  size: Order.mapInput(Order.number, (r: Release) => r.size ?? 0),
  age: Order.mapInput(Order.number, (r: Release) => r.age ?? 0),
  customFormatScore: Order.mapInput(Order.number, (r: Release) => r.customFormatScore ?? 0),
  resolution: Order.mapInput(Order.number, (r: Release) => resolutionOf(r) ?? 0),
}

const ReleaseFilter = Schema.Struct({
  title: Schema.optional(
    Text.annotations({
      description: "Match the release title — codec lives here, e.g. contains 'hevc' or 'x265'.",
    }),
  ),
  protocol: Schema.optional(Eq(Schema.String).annotations({ description: "torrent | usenet" })),
  resolution: Schema.optional(
    Ord(Schema.Number).annotations({ description: "Vertical resolution, e.g. 1080 (range ops)." }),
  ),
  quality: Schema.optional(
    Text.annotations({
      description: "Match the quality name, e.g. 'Bluray-1080p' (text operators).",
    }),
  ),
  indexer: Schema.optional(
    Text.annotations({ description: "Match the indexer name (text operators)." }),
  ),
  releaseGroup: Schema.optional(
    Text.annotations({ description: "Match the release group (text operators)." }),
  ),
  seeders: Schema.optional(
    Ord(Schema.Number).annotations({ description: "Torrent seeders (range ops)." }),
  ),
  size: Schema.optional(
    Ord(Schema.Number).annotations({ description: "Size in bytes (range ops)." }),
  ),
  age: Schema.optional(Ord(Schema.Number).annotations({ description: "Age in days (range ops)." })),
  customFormatScore: Schema.optional(
    Ord(Schema.Number).annotations({ description: "Custom-format score (range ops)." }),
  ),
  approved: Schema.optional(
    Bool.annotations({ description: "Whether Radarr approved the release (passed its filters)." }),
  ),
})
type ReleaseFilterValue = Schema.Schema.Type<typeof ReleaseFilter>
const ReleaseSort = Schema.Array(
  Schema.Struct({
    field: Schema.Literal("seeders", "size", "age", "customFormatScore", "resolution"),
    order: Schema.optional(SortOrder),
  }),
)
type ReleaseSortValue = Schema.Schema.Type<typeof ReleaseSort>

const matchesRelease = (r: Release, f: ReleaseFilterValue = {}) =>
  matchText(r.title, f.title) &&
  matchEquality(r.protocol, f.protocol) &&
  matchOrdered(resolutionOf(r), f.resolution) &&
  matchText(qualityNameOf(r), f.quality) &&
  matchText(r.indexer, f.indexer) &&
  matchText(r.releaseGroup, f.releaseGroup) &&
  matchOrdered(r.seeders, f.seeders) &&
  matchOrdered(r.size, f.size) &&
  matchOrdered(r.age, f.age) &&
  matchOrdered(r.customFormatScore, f.customFormatScore) &&
  matchBoolean(r.approved ?? false, f.approved)

const releaseOrder = (sort: ReleaseSortValue) =>
  Order.combineAll(
    sort.map((s) =>
      s.order === "asc" ? releaseOrders[s.field] : Order.reverse(releaseOrders[s.field]),
    ),
  )

// ---- queue ----------------------------------------------------------------

const queueOrders: Record<"title" | "size" | "sizeleft", Order.Order<QueueItem>> = {
  title: Order.mapInput(Order.string, (q: QueueItem) => (q.title ?? "").toLowerCase()),
  size: Order.mapInput(Order.number, (q: QueueItem) => q.size ?? 0),
  sizeleft: Order.mapInput(Order.number, (q: QueueItem) => q.sizeleft ?? 0),
}

const QueueFilter = Schema.Struct({
  movieId: Schema.optional(
    Eq(Schema.Number).annotations({ description: "Scope to one movie's downloads." }),
  ),
  status: Schema.optional(
    Eq(Schema.String).annotations({ description: "queued | downloading | paused | completed | …" }),
  ),
  trackedDownloadState: Schema.optional(
    Eq(Schema.String).annotations({ description: "downloading | importPending | imported | …" }),
  ),
  protocol: Schema.optional(Eq(Schema.String).annotations({ description: "torrent | usenet" })),
  title: Schema.optional(
    Text.annotations({ description: "Match the queued release title (text operators)." }),
  ),
})
type QueueFilterValue = Schema.Schema.Type<typeof QueueFilter>
const QueueSort = Schema.Array(
  Schema.Struct({
    field: Schema.Literal("title", "size", "sizeleft"),
    order: Schema.optional(SortOrder),
  }),
)
type QueueSortValue = Schema.Schema.Type<typeof QueueSort>

const matchesQueue = (q: QueueItem, f: QueueFilterValue = {}) =>
  matchText(q.title, f.title) &&
  matchEquality(q.movieId, f.movieId) &&
  matchEquality(q.status, f.status) &&
  matchEquality(q.trackedDownloadState, f.trackedDownloadState) &&
  matchEquality(q.protocol, f.protocol)

const queueOrder = (sort: QueueSortValue) =>
  Order.combineAll(
    sort.map((s) =>
      s.order === "desc" ? Order.reverse(queueOrders[s.field]) : queueOrders[s.field],
    ),
  )

// ---- tools ----------------------------------------------------------------

const GetSystemStatus = Tool.make("get_system_status", {
  description:
    "Get the Radarr instance status — version, runtime, OS, database, and authentication info.",
  success: SystemStatus,
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListMovies = Tool.make("list_movies", {
  description:
    "List movies in the Radarr library as lean summaries; filter, sort, and paginate (opaque " +
    "cursor). Use this to resolve a movie title to its Radarr movie id before searching for " +
    "releases — Radarr can only search for a movie already in the library.",
  parameters: {
    filter: Schema.optional(MovieFilter),
    sort: Schema.optional(MovieSort),
    page: Schema.optional(PageInput),
  },
  success: CursorPage(MovieSummary),
  failure: ToolError,
}).annotateContext(readonlyHints)

const SearchReleases = Tool.make("search_releases", {
  description:
    "Run an interactive indexer search for a movie already in the library, then filter, sort, and " +
    "paginate the candidates. Slow — it queries the configured indexers live. Each result carries " +
    "its guid + indexerId; pass those to grab_release to grab one. Codec (HEVC/x265) lives in the " +
    "title, so filter it via filter.title.contains; resolution comes from filter.resolution. " +
    "Default order is Radarr's own ranking unless you pass sort.",
  parameters: {
    movieId: Schema.Number,
    filter: Schema.optional(ReleaseFilter),
    sort: Schema.optional(ReleaseSort),
    page: Schema.optional(PageInput),
  },
  success: CursorPage(Release),
  failure: ToolError,
}).annotateContext(searchHints)

const GrabRelease = Tool.make("grab_release", {
  description:
    "Grab a release found by search_releases (identified by its guid + indexerId) and hand it to " +
    "the download client; it then appears in list_queue. Pass title only to echo it back in the " +
    "confirmation.",
  parameters: {
    guid: Schema.String,
    indexerId: Schema.Number,
    title: Schema.optional(Schema.String),
  },
  success: GrabResult,
  failure: ToolError,
}).annotateContext(grabHints)

const ListQueue = Tool.make("list_queue", {
  description:
    "List the Radarr download queue — grabs in flight on the download client; filter, sort, and " +
    "paginate. Use after grab_release to confirm a download started.",
  parameters: {
    filter: Schema.optional(QueueFilter),
    sort: Schema.optional(QueueSort),
    page: Schema.optional(PageInput),
  },
  success: CursorPage(QueueItem),
  failure: ToolError,
}).annotateContext(readonlyHints)

export const RadarrToolkit = Toolkit.make(
  GetSystemStatus,
  ListMovies,
  SearchReleases,
  GrabRelease,
  ListQueue,
)

// Handlers in isolation: call the Radarr client and map `RadarrError` to the
// tool-error shape. Exported so unit tests can drive them directly.

/** Run a Radarr operation, surfacing its `RadarrError` as the tool-error shape. */
const handle = <A>(effect: Effect.Effect<A, RadarrError>) =>
  effect.pipe(Effect.mapError(toToolError))

export interface MovieListArguments {
  readonly filter?: MovieFilterValue | undefined
  readonly sort?: MovieSortValue | undefined
  readonly page?: PageInputValue | undefined
}

export interface ReleaseSearchArguments {
  readonly movieId: number
  readonly filter?: ReleaseFilterValue | undefined
  readonly sort?: ReleaseSortValue | undefined
  readonly page?: PageInputValue | undefined
}

export interface QueueListArguments {
  readonly filter?: QueueFilterValue | undefined
  readonly sort?: QueueSortValue | undefined
  readonly page?: PageInputValue | undefined
}

export interface GrabArguments {
  readonly guid: string
  readonly indexerId: number
  readonly title?: string | undefined
}

export const getSystemStatus = (radarr: RadarrService) => handle(radarr.system.getStatus)

export const listMovies = (radarr: RadarrService, p: MovieListArguments = {}) =>
  decodeCursor(p.page?.cursor).pipe(
    Effect.flatMap((offset) =>
      handle(radarr.movie.list).pipe(
        Effect.map((all) => {
          const filtered = all.filter((m) => matchesMovie(m, p.filter))
          const sorted = filtered.toSorted(movieOrder(p.sort))
          return pageByCursor(sorted, offset, p.page?.size, toMovieSummary)
        }),
      ),
    ),
  )

export const searchReleases = (radarr: RadarrService, p: ReleaseSearchArguments) =>
  decodeCursor(p.page?.cursor).pipe(
    Effect.flatMap((offset) =>
      handle(radarr.release.search(p.movieId)).pipe(
        Effect.map((all) => {
          const filtered = all.filter((r) => matchesRelease(r, p.filter))
          // No sort given → keep Radarr's own ranking (releaseWeight), not re-sorted.
          const sorted = p.sort?.length ? filtered.toSorted(releaseOrder(p.sort)) : filtered
          return pageByCursor(sorted, offset, p.page?.size, (r) => r)
        }),
      ),
    ),
  )

/** Grab a release, echoing the keys (and optional title) back since the SDK call is void. */
export const grabRelease = (radarr: RadarrService, input: GrabArguments) => {
  const confirmation = {
    guid: input.guid,
    indexerId: input.indexerId,
    ...(Predicate.isNotUndefined(input.title) && { title: input.title }),
  }
  return handle(
    radarr.release
      .grab({ guid: input.guid, indexerId: input.indexerId })
      .pipe(Effect.as(confirmation)),
  )
}

export const listQueue = (radarr: RadarrService, p: QueueListArguments = {}) =>
  decodeCursor(p.page?.cursor).pipe(
    Effect.flatMap((offset) =>
      handle(radarr.queue.list).pipe(
        Effect.map((page) => {
          const filtered = page.records.filter((q) => matchesQueue(q, p.filter))
          const sorted = p.sort?.length ? filtered.toSorted(queueOrder(p.sort)) : filtered
          return pageByCursor(sorted, offset, p.page?.size, (q) => q)
        }),
      ),
    ),
  )

/** Toolkit handlers, reading the Radarr client from context. */
export const RadarrToolkitLive = RadarrToolkit.toLayer(
  Effect.gen(function* () {
    const radarr = yield* Radarr
    return {
      get_system_status: () => getSystemStatus(radarr),
      list_movies: (parameters) => listMovies(radarr, parameters),
      search_releases: (parameters) => searchReleases(radarr, parameters),
      grab_release: (input) => grabRelease(radarr, input),
      list_queue: (parameters) => listQueue(radarr, parameters),
    }
  }),
)
