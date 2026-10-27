/** How to reach a feed. */
export interface FeedOptions {
  /** http(s), or webcal(s) which is read over https */
  url: string
  username?: string | undefined
  password?: string | undefined
  timeoutMs: number
}

/**
 * Downloads an iCalendar feed. Private feed links carry their token in the URL, so neither the
 * URL nor its path appear in errors: messages name the host only, and are fit for a status line.
 */
export class FeedClient {
  /**
   * A bound on memory: the worker has 128 MB, a parsed calendar takes several times its text, and
   * the last good calendar stays in memory while the next is parsed. A 20 MB feed came within
   * 10 MB of the limit; real calendars with years of history are 1 to 5 MB.
   */
  static readonly MAX_BYTES = 8 * 1024 * 1024
  readonly host: string
  private readonly url: URL
  private readonly authorization: string | undefined

  constructor(private readonly options: FeedOptions) {
    const url = new URL(options.url.replace(/^webcals?:/i, "https:"))
    // fetch() refuses URLs with credentials, so user:pass@host becomes basic auth like in a browser
    // the config refuses links where decoding would throw (credentialsReadable)
    const username = options.username ?? decodeURIComponent(url.username)
    const password = options.password ?? decodeURIComponent(url.password)
    url.username = ""
    url.password = ""
    this.url = url
    this.host = url.host
    this.authorization = username ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` : undefined
  }

  /** false when the user name or password in a link is broken percent-encoding (https://a%zz@host) */
  static credentialsReadable(link: string) {
    const url = URL.parse(link)
    try {
      if (url) [url.username, url.password].forEach(part => decodeURIComponent(part))
      return true
    } catch {
      return false
    }
  }

  /** @returns the feed's text; @throws Error with a message that names the host, never the URL */
  async fetch(signal?: AbortSignal): Promise<string> {
    try {
      return await this.request(signal)
    } catch (error) {
      throw new Error(`${this.host}: ${this.describe(error)}`, { cause: error })
    }
  }

  private async request(signal?: AbortSignal) {
    const timeout = AbortSignal.timeout(this.options.timeoutMs)
    const response = await fetch(this.url, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      // refreshes are minutes apart; a pooled keep-alive socket would outlive the plugin's stop
      headers: {
        accept: "text/calendar, */*;q=0.5", connection: "close",
        ...(this.authorization ? { authorization: this.authorization } : {})
      }
    })
    if (response.status !== 200) {
      await response.body?.cancel()
      throw new Error(FeedClient.statusMessage(response.status))
    }
    return await FeedClient.text(response)
  }

  private static statusMessage(status: number) {
    if (status === 401 || status === 403) return `HTTP ${status}, access denied: check the username and password, or whether the private link is still valid`
    if (status === 404 || status === 410) return `HTTP ${status}, no calendar at this link: it may have been reset or deleted`
    return `HTTP ${status}`
  }

  // read in chunks, so an endless or huge answer is cut off before it fills the heap
  private static async text(response: Response) {
    const reader = response.body?.getReader()
    if (!reader) return ""
    const chunks: Uint8Array[] = []
    let size = 0
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      size += chunk.value.byteLength
      if (size > FeedClient.MAX_BYTES) {
        await reader.cancel()
        throw new Error(`the feed is larger than ${FeedClient.MAX_BYTES / 1024 / 1024} MB`)
      }
      chunks.push(chunk.value)
    }
    return Buffer.concat(chunks).toString("utf8")
  }

  private describe(error: unknown): string {
    if (!(error instanceof Error)) return String(error)
    if (error.name === "TimeoutError") return `no answer within ${this.options.timeoutMs / 1000} s`
    // fetch reports network errors as "fetch failed" with the useful part in the cause
    if (error.cause instanceof Error) return `unreachable (${error.cause.message})`
    return error.message
  }
}
