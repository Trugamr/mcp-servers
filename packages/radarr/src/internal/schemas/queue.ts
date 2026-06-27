import { optionalNullable } from "@trugamr/kit"
import { Schema } from "effect"
import { Quality } from "./quality.js"

/**
 * One item in `GET /api/v3/queue` — a grab in flight on the download client. Lean:
 * enough for an agent to report progress and spot a stuck or errored download.
 * `sizeleft`/`timeleft` keep Radarr's lowercase field names. `Schema.Struct` drops
 * the rest of the (large) queue payload.
 */
export const QueueItem = Schema.Struct({
  id: Schema.Number,
  movieId: Schema.optional(Schema.Number),
  title: optionalNullable(Schema.String),
  status: Schema.optional(Schema.String), // queued | downloading | paused | completed | …
  trackedDownloadStatus: Schema.optional(Schema.String),
  trackedDownloadState: Schema.optional(Schema.String),
  size: Schema.optional(Schema.Number),
  sizeleft: Schema.optional(Schema.Number),
  timeleft: optionalNullable(Schema.String),
  estimatedCompletionTime: optionalNullable(Schema.String),
  indexer: optionalNullable(Schema.String),
  downloadClient: optionalNullable(Schema.String),
  protocol: Schema.optional(Schema.String),
  quality: Schema.optional(Quality),
  errorMessage: optionalNullable(Schema.String),
})

export type QueueItem = Schema.Schema.Type<typeof QueueItem>

/**
 * `GET /api/v3/queue` response — a paginated envelope. The SDK returns page one;
 * paging is deferred. `totalRecords` lets a caller see how many grabs are in flight
 * beyond the returned page.
 */
export const QueuePage = Schema.Struct({
  records: Schema.Array(QueueItem),
  totalRecords: Schema.Number,
})

export type QueuePage = Schema.Schema.Type<typeof QueuePage>
