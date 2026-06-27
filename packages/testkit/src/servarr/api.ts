/** Credentials for driving a Servarr app's API directly. */
export interface ServarrCredentials {
  readonly baseUrl: string
  readonly apiKey: string
}

/**
 * An authenticated client for driving a Servarr app's API directly — seeds use
 * this because the SDKs are read-only for the resources they set up. `send` throws
 * on a non-2xx status; `readJson` does the same and returns the decoded body, typed
 * as whatever shape the caller annotates (the body is `any`, so no cast is needed).
 */
export const servarrApi = ({ baseUrl, apiKey }: ServarrCredentials) => {
  const send = async (path: string, init?: RequestInit): Promise<Response> => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    })
    if (!response.ok) {
      throw new Error(`${init?.method ?? "GET"} ${path} → HTTP ${response.status}`)
    }
    return response
  }

  const readJson = async (path: string, init?: RequestInit): Promise<any> =>
    (await send(path, init)).json()

  return { send, readJson }
}

/** The authenticated client returned by `servarrApi`, for threading into helpers. */
export type ServarrApi = ReturnType<typeof servarrApi>
