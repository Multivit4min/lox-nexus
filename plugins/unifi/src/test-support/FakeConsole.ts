import { createServer, type Server } from "node:https"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { FakeConsoleState } from "./FakeConsoleState.ts"
import { FakeRoutes } from "./FakeRoutes.ts"
import type { Json } from "./Fixtures.ts"
import { SelfSignedCertificate } from "./SelfSignedCertificate.ts"

/** a request the fake console received */
export interface Received {
  method: string
  /** below the API base, e.g. /v1/sites */
  path: string
  query: URLSearchParams
  body: unknown
  apiKey: string | undefined
}

/**
 * A UniFi console on 127.0.0.1 (port 0), over HTTPS with its own fresh self-signed certificate,
 * answering the Integration API under /proxy/network/integration from synthetic fixtures. It
 * checks the X-API-Key header like the real one (401 with an "Error Message" body).
 */
export class FakeConsole {
  static readonly KEY = "synthetic-test-key"
  static readonly BASE = "/proxy/network/integration"
  readonly requests: Received[] = []
  readonly state = new FakeConsoleState()
  private readonly routes = new FakeRoutes(this.state)

  private constructor(readonly certificate: SelfSignedCertificate, private readonly server: Server) {}

  static async start(certificate = SelfSignedCertificate.generate()) {
    let fake: FakeConsole | undefined = undefined
    const server = createServer({ cert: certificate.cert, key: certificate.key }, (request, response) => void fake!.handle(request, response))
    fake = new FakeConsole(certificate, server)
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    return fake
  }

  get host() {
    return `127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  /** a config that reaches this console, pinned to its certificate */
  config(extra: Json = {}): Json {
    return { host: this.host, apiKey: FakeConsole.KEY, fingerprint: this.certificate.fingerprint, ...extra }
  }

  /** the requests to a path (below the base) matching the pattern, optionally of one method */
  calls(pattern: RegExp, method?: string) {
    return this.requests.filter(request => pattern.test(request.path) && (method === undefined || request.method === method))
  }

  async close() {
    this.server.closeAllConnections()
    await new Promise<void>(resolve => this.server.close(() => resolve()))
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "https://fake")
    const text = await FakeConsole.read(request)
    const path = url.pathname.startsWith(FakeConsole.BASE) ? url.pathname.slice(FakeConsole.BASE.length) : url.pathname
    const apiKey = request.headers["x-api-key"] as string | undefined
    const received: Received = { method: request.method ?? "GET", path, query: url.searchParams, body: text ? JSON.parse(text) : undefined, apiKey }
    this.requests.push(received)
    if (this.state.hang) return
    const answer = apiKey === FakeConsole.KEY
      ? this.routes.answer(received)
      : { status: 401, body: FakeRoutes.error(401, "UNAUTHORIZED", "api.authentication.missing-credentials", "Missing credentials", path) }
    response.writeHead(answer.status, { "content-type": "application/json" })
    response.end(answer.body === undefined ? "" : JSON.stringify(answer.body))
  }

  private static async read(request: IncomingMessage) {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString("utf8")
  }
}
