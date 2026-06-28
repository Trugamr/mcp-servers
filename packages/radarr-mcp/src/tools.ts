import { Tool, Toolkit } from "@effect/ai"
import {
  type AddMovie,
  Language,
  Movie,
  MovieLookup,
  QualityProfile,
  QualityProfileInput,
  QualityProfilePatch,
  QueueItem,
  Radarr,
  type RadarrError,
  type RadarrService,
  Release,
  RootFolder,
  SystemStatus,
} from "@trugamr/radarr/effect"
import { Context, Effect, Encoding, Order, Predicate, Schema } from "effect"

/** Tool-call failure shape returned to the model when a Radarr call fails. */
const ToolError = Schema.Struct({
  _tag: Schema.String,
  message: Schema.String,
})

/**
 * Acknowledgement returned by a grab. `accepted: true` marks that Radarr took the
 * release — not that the download started; `list_queue` confirms that. Echoes the keys
 * grabbed, plus the optional title.
 */
const GrabResult = Schema.Struct({
  accepted: Schema.Boolean,
  guid: Schema.String,
  indexerId: Schema.Number,
  title: Schema.optional(Schema.String),
})

/** Confirmation echoed back after a delete/remove — the SDK call is void, so the id stands in. */
const DeletedResource = Schema.Struct({ id: Schema.Number })

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
// Add reaches Radarr's metadata provider to resolve the movie; remove stays local.
const addHints = hints({ readonly: false, destructive: false, openWorld: true })
const removeHints = hints({ readonly: false, destructive: true, openWorld: false })
// Config writes stay on the configured instance; a delete removes a resource Radarr
// (and the movies referencing it) may depend on, so it's marked destructive.
const writeHints = hints({ readonly: false, destructive: false, openWorld: false })
const deleteHints = hints({ readonly: false, destructive: true, openWorld: false })

// Structured query surface for the list tools: filter / sort / paginate, applied
// client-side because Radarr's `/movie`, `/release`, and `/queue` reads return flat
// lists. Mirrors `@trugamr/sonarr-mcp`'s query layer; the SDK stays a thin wrapper
// over the endpoints, so the richness lives here. Explicit per-field operators keep
// the inputSchema free of `anyOf`.
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const SortOrder = Schema.Literal("asc", "desc")

/** Equality + set membership operators over a value type. */
const EqualityOperators = <A, I>(s: Schema.Schema<A, I>) =>
  Schema.Struct({
    eq: Schema.optional(s),
    ne: Schema.optional(s),
    in: Schema.optional(Schema.Array(s)),
    nin: Schema.optional(Schema.Array(s)),
  })
/** Ordered operators = equality/set + range comparisons (numbers, ISO-date strings). */
const OrderedOperators = <A, I>(s: Schema.Schema<A, I>) =>
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
/** Operators for a text field. `contains` is a case-insensitive substring match. */
const TextOperators = Schema.Struct({
  eq: Schema.optional(Schema.String),
  ne: Schema.optional(Schema.String),
  contains: Schema.optional(Schema.String),
  in: Schema.optional(Schema.Array(Schema.String)),
  nin: Schema.optional(Schema.Array(Schema.String)),
})
/** Boolean operator. */
const BooleanOperator = Schema.Struct({ eq: Schema.optional(Schema.Boolean) })

// Operator-object value types are derived from the schema builders, so the matchers
// can't drift from the schemas they validate against.
type EqualityOperatorsValue<A> = Schema.Schema.Type<ReturnType<typeof EqualityOperators<A, A>>>
type OrderedOperatorsValue<A> = Schema.Schema.Type<ReturnType<typeof OrderedOperators<A, A>>>
export type TextOperatorsValue = Schema.Schema.Type<typeof TextOperators>
type BooleanOperatorValue = Schema.Schema.Type<typeof BooleanOperator>

// Each matcher returns true when the value satisfies every present operator (an
// absent operator is a no-op), so a missing filter short-circuits to `true`.
const matchEquality = <T>(value: T, operators?: EqualityOperatorsValue<T>) =>
  !operators ||
  ((Predicate.isUndefined(operators.eq) || value === operators.eq) &&
    (Predicate.isUndefined(operators.ne) || value !== operators.ne) &&
    (Predicate.isUndefined(operators.in) || operators.in.includes(value)) &&
    (Predicate.isUndefined(operators.nin) || !operators.nin.includes(value)))
// A null/absent value fails any present ordered constraint.
const matchOrdered = <T extends string | number>(
  value: T | null | undefined,
  operators?: OrderedOperatorsValue<T>,
) =>
  !operators ||
  (Predicate.isNotNullable(value) &&
    matchEquality(value, operators) &&
    (Predicate.isUndefined(operators.gte) || value >= operators.gte) &&
    (Predicate.isUndefined(operators.lte) || value <= operators.lte) &&
    (Predicate.isUndefined(operators.gt) || value > operators.gt) &&
    (Predicate.isUndefined(operators.lt) || value < operators.lt))
const matchText = (value: string | null | undefined, operators?: TextOperatorsValue) => {
  const text = value ?? ""
  return (
    !operators ||
    ((Predicate.isUndefined(operators.eq) || text === operators.eq) &&
      (Predicate.isUndefined(operators.ne) || text !== operators.ne) &&
      (Predicate.isUndefined(operators.contains) ||
        text.toLowerCase().includes(operators.contains.toLowerCase())) &&
      (Predicate.isUndefined(operators.in) || operators.in.includes(text)) &&
      (Predicate.isUndefined(operators.nin) || !operators.nin.includes(text)))
  )
}
// Apply text operators to a multi-valued field (e.g. genres) with set semantics:
// positive operators are existential (some value satisfies them), negatives are
// universal (no value violates them). An empty/absent field satisfies only the
// negative operators — it isn't excluded by `ne`/`nin`.
const matchTextArray = (
  field: ReadonlyArray<string> | undefined,
  operators?: TextOperatorsValue,
) => {
  const values = field ?? []
  const containsLower = operators?.contains?.toLowerCase()
  return (
    !operators ||
    ((Predicate.isUndefined(operators.eq) || values.includes(operators.eq)) &&
      (Predicate.isUndefined(operators.ne) || !values.includes(operators.ne)) &&
      (Predicate.isUndefined(containsLower) ||
        values.some((value) => value.toLowerCase().includes(containsLower))) &&
      (Predicate.isUndefined(operators.in) ||
        operators.in.some((value) => values.includes(value))) &&
      (Predicate.isUndefined(operators.nin) ||
        !operators.nin.some((value) => values.includes(value))))
  )
}
const matchBoolean = (value: boolean, operators?: BooleanOperatorValue) =>
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

/** Plain list envelope for small, unpaged results — `{ items }`; MCP rejects a bare array. */
const ListResult = <A, I>(item: Schema.Schema<A, I>) => Schema.Struct({ items: Schema.Array(item) })

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
// titleSlug, certification, tags, runtime, …) and keep what identifies and
// ranks a movie. Derived from the SDK `Movie` so field types track the source.
const MovieSummary = Movie.pick(
  "id",
  "title",
  "year",
  "status",
  "monitored",
  "tmdbId",
  "imdbId",
  "qualityProfileId",
  "hasFile",
  "studio",
  "genres",
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
  ...(Predicate.isNotUndefined(m.imdbId) && { imdbId: m.imdbId }),
  ...(Predicate.isNotUndefined(m.studio) && { studio: m.studio }),
  ...(Predicate.isNotUndefined(m.genres) && { genres: m.genres }),
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
    TextOperators.annotations({ description: "Match the movie title (text operators)." }),
  ),
  status: Schema.optional(
    EqualityOperators(Schema.String).annotations({
      description: "announced | inCinemas | released | deleted",
    }),
  ),
  monitored: Schema.optional(
    BooleanOperator.annotations({ description: "Whether the movie is monitored." }),
  ),
  hasFile: Schema.optional(
    BooleanOperator.annotations({ description: "Whether a movie file is present." }),
  ),
  qualityProfileId: Schema.optional(
    EqualityOperators(Schema.Number).annotations({ description: "Quality profile id." }),
  ),
  studio: Schema.optional(
    TextOperators.annotations({ description: "Match the studio (text operators)." }),
  ),
  genres: Schema.optional(
    TextOperators.annotations({
      description:
        "Match genres (set semantics), e.g. contains 'drama', in ['Drama'], nin ['Anime'].",
    }),
  ),
  year: Schema.optional(
    OrderedOperators(Schema.Number).annotations({ description: "Release year (range ops)." }),
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
  matchTextArray(m.genres, f.genres) &&
  matchOrdered(m.year, f.year)

const movieOrder = (sort: MovieSortValue = []) =>
  Order.combineAll(
    (sort.length ? sort : [{ field: "title" as const }]).map((s) =>
      s.order === "desc" ? Order.reverse(movieOrders[s.field]) : movieOrders[s.field],
    ),
  )

// ---- movie lookup / profiles / root folders -------------------------------

// Lean lookup candidate: identity plus the tmdbId an add needs, and the context to
// pick the right title and decide whether to add it. `status` (released/announced/
// inCinemas) and `runtime` inform the add decision and disambiguate same-title hits.
// `id` is present only for a movie already in the library (its library id); a missing
// id marks a candidate not added yet.
const MovieLookupSummary = MovieLookup.pick(
  "id",
  "tmdbId",
  "title",
  "year",
  "status",
  "runtime",
  "overview",
  "imdbId",
  "studio",
  "genres",
)
type MovieLookupSummary = Schema.Schema.Type<typeof MovieLookupSummary>

const toMovieLookupSummary = (m: MovieLookup): MovieLookupSummary => ({
  tmdbId: m.tmdbId,
  title: m.title,
  year: m.year,
  ...(Predicate.isNotUndefined(m.id) && { id: m.id }),
  ...(Predicate.isNotUndefined(m.status) && { status: m.status }),
  ...(Predicate.isNotUndefined(m.runtime) && { runtime: m.runtime }),
  ...(Predicate.isNotUndefined(m.overview) && { overview: m.overview }),
  ...(Predicate.isNotUndefined(m.imdbId) && { imdbId: m.imdbId }),
  ...(Predicate.isNotUndefined(m.studio) && { studio: m.studio }),
  ...(Predicate.isNotUndefined(m.genres) && { genres: m.genres }),
})

// Just id + name — enough to pick a profile for an add. The quality list it allows is
// dropped; codec (HEVC/x265) isn't a profile concept, so the name carries the signal.
const QualityProfileSummary = QualityProfile.pick("id", "name")
type QualityProfileSummary = Schema.Schema.Type<typeof QualityProfileSummary>

const toQualityProfileSummary = (p: QualityProfile): QualityProfileSummary => ({
  id: p.id,
  name: p.name,
})

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
    TextOperators.annotations({
      description: "Match the release title — codec lives here, e.g. contains 'hevc' or 'x265'.",
    }),
  ),
  protocol: Schema.optional(
    EqualityOperators(Schema.String).annotations({ description: "torrent | usenet" }),
  ),
  resolution: Schema.optional(
    OrderedOperators(Schema.Number).annotations({
      description: "Vertical resolution, e.g. 1080 (range ops).",
    }),
  ),
  quality: Schema.optional(
    TextOperators.annotations({
      description: "Match the quality name, e.g. 'Bluray-1080p' (text operators).",
    }),
  ),
  indexer: Schema.optional(
    TextOperators.annotations({ description: "Match the indexer name (text operators)." }),
  ),
  releaseGroup: Schema.optional(
    TextOperators.annotations({ description: "Match the release group (text operators)." }),
  ),
  seeders: Schema.optional(
    OrderedOperators(Schema.Number).annotations({ description: "Torrent seeders (range ops)." }),
  ),
  size: Schema.optional(
    OrderedOperators(Schema.Number).annotations({ description: "Size in bytes (range ops)." }),
  ),
  age: Schema.optional(
    OrderedOperators(Schema.Number).annotations({ description: "Age in days (range ops)." }),
  ),
  customFormatScore: Schema.optional(
    OrderedOperators(Schema.Number).annotations({
      description: "Custom-format score (range ops).",
    }),
  ),
  approved: Schema.optional(
    BooleanOperator.annotations({
      description: "Whether Radarr approved the release (passed its filters).",
    }),
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
  id: Schema.optional(
    EqualityOperators(Schema.Number).annotations({
      description: "The queue record's own id.",
    }),
  ),
  movieId: Schema.optional(
    EqualityOperators(Schema.Number).annotations({
      description: "Scope to one movie's downloads.",
    }),
  ),
  downloadId: Schema.optional(
    EqualityOperators(Schema.String).annotations({
      description:
        "The download client's id (torrent hash / nzb id) — stable across polls and into history.",
    }),
  ),
  status: Schema.optional(
    EqualityOperators(Schema.String).annotations({
      description: "queued | downloading | paused | completed | …",
    }),
  ),
  trackedDownloadState: Schema.optional(
    EqualityOperators(Schema.String).annotations({
      description: "downloading | importPending | imported | …",
    }),
  ),
  protocol: Schema.optional(
    EqualityOperators(Schema.String).annotations({ description: "torrent | usenet" }),
  ),
  title: Schema.optional(
    TextOperators.annotations({ description: "Match the queued release title (text operators)." }),
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
  matchEquality(q.id, f.id) &&
  matchEquality(q.movieId, f.movieId) &&
  matchEquality(q.downloadId, f.downloadId) &&
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
    "the download client. Returns immediately with accepted: true — an acknowledgement, NOT " +
    "confirmation that the download started. To confirm, poll list_queue filtered by the movieId " +
    "you searched, find the new record, then track it by its downloadId (filter.downloadId) and " +
    "watch status / trackedDownloadState.",
  parameters: {
    guid: Schema.String,
    indexerId: Schema.Number,
    title: Schema.optional(
      Schema.String.annotations({
        description: "The release title, echoed back in the acknowledgement. Optional.",
      }),
    ),
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

const LookupMovie = Tool.make("lookup_movie", {
  description:
    "Search the metadata provider for a movie to add to the library, by a free-text term " +
    "(title, year, imdb, or tmdb). Returns candidates carrying their tmdbId; an item with no id " +
    "isn't in the library yet, while a present id is its existing library movie id. Pass the " +
    "chosen tmdbId to add_movie. Slow — it queries an external metadata provider.",
  parameters: { term: Schema.String },
  success: ListResult(MovieLookupSummary),
  failure: ToolError,
}).annotateContext(searchHints)

const AddMovie = Tool.make("add_movie", {
  description:
    "Add a movie to the library by its tmdbId (from lookup_movie), under a quality profile " +
    "(list_quality_profiles) and root folder (list_root_folders). This does NOT start a release " +
    "search — to get a file, follow up with search_releases then grab_release, filtering codec " +
    "(HEVC/x265) and resolution there. Returns the added movie.",
  parameters: {
    tmdbId: Schema.Number,
    qualityProfileId: Schema.Number,
    rootFolderPath: Schema.String,
    monitored: Schema.optional(
      Schema.Boolean.annotations({
        description:
          "Whether Radarr monitors the movie for releases. Defaults to true (monitored) when omitted.",
      }),
    ),
    minimumAvailability: Schema.optional(
      Schema.String.annotations({
        description:
          'Earliest point Radarr treats the movie as available to search: "tba", "announced", ' +
          '"inCinemas", or "released". Defaults to "released" when omitted.',
      }),
    ),
  },
  success: MovieSummary,
  failure: ToolError,
}).annotateContext(addHints)

const RemoveMovie = Tool.make("remove_movie", {
  description: "Remove a movie from the library by its Radarr movie id. Echoes the removed id.",
  parameters: {
    id: Schema.Number,
    deleteFiles: Schema.optional(
      Schema.Boolean.annotations({
        description:
          "Whether to also delete the movie's files on disk. Defaults to false (keep the files) when omitted.",
      }),
    ),
    addImportListExclusion: Schema.optional(
      Schema.Boolean.annotations({
        description:
          "Whether to add an import list exclusion so a list doesn't re-add the movie. Defaults to false when omitted.",
      }),
    ),
  },
  success: DeletedResource,
  failure: ToolError,
}).annotateContext(removeHints)

const ListQualityProfiles = Tool.make("list_quality_profiles", {
  description:
    "List the Radarr quality profiles (id + name) to pick one for add_movie. Note HEVC/x265 " +
    "isn't a profile field — codec is chosen at grab time via the release title.",
  success: ListResult(QualityProfileSummary),
  failure: ToolError,
}).annotateContext(readonlyHints)

const GetQualityProfile = Tool.make("get_quality_profile", {
  description:
    "Get one Radarr quality profile in full by id — its quality items tree, cutoff, format-score " +
    "rules, and language. Returns enough to clone, adjust, and re-send via create_quality_profile " +
    "or update_quality_profile.",
  parameters: { id: Schema.Number },
  success: QualityProfile,
  failure: ToolError,
}).annotateContext(readonlyHints)

const CreateQualityProfile = Tool.make("create_quality_profile", {
  description:
    "Create a quality profile. There is no schema endpoint, so build `profile` by cloning an " +
    "existing one (get_quality_profile), dropping its id, and adjusting fields. `cutoff` must be " +
    "the id of an allowed item; `language` comes from list_languages and each " +
    "`formatItems[].format` from list_custom_formats. Returns the created profile.",
  parameters: { profile: QualityProfileInput },
  success: QualityProfile,
  failure: ToolError,
}).annotateContext(writeHints)

const UpdateQualityProfile = Tool.make("update_quality_profile", {
  description:
    "Update a quality profile by id. Put only the fields to change in `profile`; unspecified " +
    "fields keep their current values. Array fields (items, formatItems) replace wholesale when " +
    "given. Returns the updated profile.",
  parameters: { id: Schema.Number, profile: QualityProfilePatch },
  success: QualityProfile,
  failure: ToolError,
}).annotateContext(writeHints)

const DeleteQualityProfile = Tool.make("delete_quality_profile", {
  description:
    "Delete a quality profile by id. Movies using it must be moved to another profile first, or " +
    "Radarr rejects the delete. Echoes the deleted id.",
  parameters: { id: Schema.Number },
  success: DeletedResource,
  failure: ToolError,
}).annotateContext(deleteHints)

const ListLanguages = Tool.make("list_languages", {
  description:
    "List Radarr's available languages (id + name). Use an id to set a quality profile's language " +
    "via create_quality_profile or update_quality_profile.",
  success: ListResult(Language),
  failure: ToolError,
}).annotateContext(readonlyHints)

const ListRootFolders = Tool.make("list_root_folders", {
  description:
    "List the configured Radarr root folders and their free space, to pick a rootFolderPath for " +
    "add_movie.",
  success: ListResult(RootFolder),
  failure: ToolError,
}).annotateContext(readonlyHints)

export const RadarrToolkit = Toolkit.make(
  GetSystemStatus,
  ListMovies,
  LookupMovie,
  AddMovie,
  RemoveMovie,
  SearchReleases,
  GrabRelease,
  ListQueue,
  ListQualityProfiles,
  GetQualityProfile,
  CreateQualityProfile,
  UpdateQualityProfile,
  DeleteQualityProfile,
  ListLanguages,
  ListRootFolders,
)

// Handlers in isolation: call the Radarr client and map `RadarrError` to the
// tool-error shape. Exported so unit tests can drive them directly.

/** Run a Radarr operation, surfacing its `RadarrError` as the tool-error shape. */
const handle = <A>(effect: Effect.Effect<A, RadarrError>) =>
  effect.pipe(Effect.mapError(toToolError))

/**
 * Run a Radarr list operation, wrapping the array as `{ items }` so the tool's
 * structured output is a JSON object — MCP rejects a bare array there.
 */
const handleList = <A>(effect: Effect.Effect<ReadonlyArray<A>, RadarrError>) =>
  handle(effect).pipe(Effect.map((items) => ({ items })))

/** Like `handleList`, projecting each row to a lean summary before wrapping. */
const handleListProjected = <A, B>(
  effect: Effect.Effect<ReadonlyArray<A>, RadarrError>,
  project: (a: A) => B,
) => handle(effect).pipe(Effect.map((items) => ({ items: items.map(project) })))

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

/** The MCP `add_movie` input is exactly the SDK's add payload. */
export type MovieAddArguments = AddMovie

export interface MovieRemoveArguments {
  readonly id: number
  readonly deleteFiles?: boolean | undefined
  readonly addImportListExclusion?: boolean | undefined
}

export interface QualityProfileUpdateArguments {
  readonly id: number
  readonly profile: QualityProfilePatch
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

export const lookupMovie = (radarr: RadarrService, term: string) =>
  handleListProjected(radarr.movie.lookup(term), toMovieLookupSummary)

/** Add a movie by tmdbId and project the created movie to a lean summary. */
export const addMovie = (radarr: RadarrService, input: MovieAddArguments) =>
  handle(radarr.movie.add(input).pipe(Effect.map(toMovieSummary)))

/** Remove a movie, echoing the id back since the SDK call is void. */
export const removeMovie = (radarr: RadarrService, input: MovieRemoveArguments) =>
  handle(
    radarr.movie
      .remove(input.id, {
        deleteFiles: input.deleteFiles,
        addImportListExclusion: input.addImportListExclusion,
      })
      .pipe(Effect.as({ id: input.id })),
  )

export const listQualityProfiles = (radarr: RadarrService) =>
  handleListProjected(radarr.qualityProfile.list, toQualityProfileSummary)

export const getQualityProfile = (radarr: RadarrService, id: number) =>
  handle(radarr.qualityProfile.get(id))

export const createQualityProfile = (radarr: RadarrService, profile: QualityProfileInput) =>
  handle(radarr.qualityProfile.create(profile))

export const updateQualityProfile = (radarr: RadarrService, input: QualityProfileUpdateArguments) =>
  handle(radarr.qualityProfile.update(input.id, input.profile))

/** Delete a quality profile, echoing the id back since the SDK call is void. */
export const deleteQualityProfile = (radarr: RadarrService, id: number) =>
  handle(radarr.qualityProfile.remove(id).pipe(Effect.as({ id })))

export const listLanguages = (radarr: RadarrService) => handleList(radarr.language.list)

export const listRootFolders = (radarr: RadarrService) => handleList(radarr.rootFolder.list)

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

/**
 * Grab a release. The SDK call is void (Radarr 201s empty), so this returns an
 * acknowledgement — `accepted: true` plus the grabbed keys — not a confirmation that
 * the download started. The caller confirms by polling `list_queue`.
 */
export const grabRelease = (radarr: RadarrService, input: GrabArguments) => {
  const acknowledgement = {
    accepted: true,
    guid: input.guid,
    indexerId: input.indexerId,
    ...(Predicate.isNotUndefined(input.title) && { title: input.title }),
  }
  return handle(
    radarr.release
      .grab({ guid: input.guid, indexerId: input.indexerId })
      .pipe(Effect.as(acknowledgement)),
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
      lookup_movie: ({ term }) => lookupMovie(radarr, term),
      add_movie: (input) => addMovie(radarr, input),
      remove_movie: (input) => removeMovie(radarr, input),
      search_releases: (parameters) => searchReleases(radarr, parameters),
      grab_release: (input) => grabRelease(radarr, input),
      list_queue: (parameters) => listQueue(radarr, parameters),
      list_quality_profiles: () => listQualityProfiles(radarr),
      get_quality_profile: ({ id }) => getQualityProfile(radarr, id),
      create_quality_profile: ({ profile }) => createQualityProfile(radarr, profile),
      update_quality_profile: (input) => updateQualityProfile(radarr, input),
      delete_quality_profile: ({ id }) => deleteQualityProfile(radarr, id),
      list_languages: () => listLanguages(radarr),
      list_root_folders: () => listRootFolders(radarr),
    }
  }),
)
