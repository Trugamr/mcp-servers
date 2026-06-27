import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { queuePageFixture } from "./fixtures/queue.js"
import { apiUrl, runExit, setupMockServer, successOf } from "./helpers.js"

const queueUrl = apiUrl("/queue")
const server = setupMockServer()

describe("Radarr service — queue", () => {
  it("lists the download queue, decoding records and totalRecords", async () => {
    server.use(http.get(queueUrl, () => HttpResponse.json(queuePageFixture)))

    const page = successOf(await runExit((radarr) => radarr.queue.list))

    expect(page.totalRecords).toBe(1)
    expect(page.records).toHaveLength(1)
    expect(page.records[0]?.trackedDownloadState).toBe("downloading")
    // errorMessage: null normalizes to absent.
    expect(page.records[0]?.errorMessage).toBeUndefined()
  })

  it("decodes an empty queue", async () => {
    server.use(
      http.get(queueUrl, () =>
        HttpResponse.json({ page: 1, pageSize: 20, totalRecords: 0, records: [] }),
      ),
    )

    const page = successOf(await runExit((radarr) => radarr.queue.list))

    expect(page.records).toHaveLength(0)
    expect(page.totalRecords).toBe(0)
  })
})
