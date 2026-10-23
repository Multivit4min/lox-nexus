import type { FastifyInstance, InjectOptions } from "fastify"

/** Fastify inject() with a cookie jar, so tests read like a browser session. */
export class ApiClient {
  private cookie: string | undefined

  /** @param remoteAddress the client address the server sees (login throttling is per address) */
  constructor(private readonly app: FastifyInstance, private readonly remoteAddress = "127.0.0.1") {}

  /** the session cookie as a Cookie header value, for WebSocket tests */
  get cookieHeader() {
    return this.cookie
  }

  get(url: string, headers: Record<string, string> = {}) {
    return this.request({ method: "GET", url, headers })
  }

  post(url: string, body?: unknown, headers: Record<string, string> = {}) {
    return this.request({ method: "POST", url, headers, ...(body === undefined ? {} : { payload: body as object }) })
  }

  put(url: string, body: unknown) {
    return this.request({ method: "PUT", url, payload: body as object })
  }

  delete(url: string) {
    return this.request({ method: "DELETE", url })
  }

  private async request(options: InjectOptions) {
    const headers = { ...(options.headers as Record<string, string>), ...(this.cookie ? { cookie: this.cookie } : {}) }
    const response = await this.app.inject({ ...options, headers, remoteAddress: this.remoteAddress })
    const setCookie = response.cookies.find(cookie => cookie.name === "nexus_session")
    if (setCookie) this.cookie = setCookie.value ? `nexus_session=${setCookie.value}` : undefined
    return response
  }
}
