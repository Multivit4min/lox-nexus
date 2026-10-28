import { readFileSync } from "node:fs"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

type Route = { status: number; type: string; body: string; etag?: string }

/** A request as the server saw it. */
export interface SeenRequest {
  path: string
  authorization: string | undefined
  ifNoneMatch: string | undefined
}

/**
 * A fake calendar host on 127.0.0.1 (port 0) serving the synthetic feeds in test/fixtures by path
 * ("/weekly.ics"), or error answers. Test-only.
 */
export class IcsServer {
  readonly requests: SeenRequest[] = []
  private readonly routes = new Map<string, Route>()
  private gate: Promise<void> | undefined
  private readonly server = createServer((request, response) => void this.handle(request, response))

  private constructor() {}

  /** listens on a free port; call close() when done */
  static async start() {
    const fixture = new IcsServer()
    await new Promise<void>(resolve => fixture.server.listen(0, "127.0.0.1", resolve))
    return fixture
  }

  /** the text of test/fixtures/<name> */
  static fixture(name: string) {
    return readFileSync(new URL(`../../test/fixtures/${name}`, import.meta.url), "utf8")
  }

  /** the address of a path on this server */
  url(path: string) {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}${path}`
  }

  /** answers `path` with test/fixtures/<fixture>; returns this for chaining */
  serve(path: string, fixture: string) {
    return this.text(path, IcsServer.fixture(fixture), "text/calendar")
  }

  /** answers with a raw body */
  text(path: string, body: string, type = "text/html") {
    this.routes.set(path, { status: 200, type, body })
    return this
  }

  /** gives the route at `path` an ETag: answers carry it, and a request sending it back gets 304 */
  etag(path: string, value: string) {
    const route = this.routes.get(path)
    if (route) route.etag = value
    return this
  }

  /** answers `path` with an error status */
  fail(path: string, status = 500) {
    this.routes.set(path, { status, type: "text/plain", body: "failed on purpose" })
    return this
  }

  /** requests wait until the returned function is called */
  hold() {
    let release = () => {}
    this.gate = new Promise(resolve => (release = resolve))
    return () => {
      this.gate = undefined
      release()
    }
  }

  async close() {
    this.server.closeAllConnections()
    await new Promise(resolve => this.server.close(resolve))
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    const path = new URL(request.url ?? "/", "http://fixture").pathname
    this.requests.push({ path, authorization: request.headers.authorization, ifNoneMatch: request.headers["if-none-match"] })
    await this.gate
    const route = this.routes.get(path)
    if (!route) return response.writeHead(404).end()
    const etag = route.etag ? { etag: route.etag } : {}
    if (route.etag && request.headers["if-none-match"] === route.etag) return response.writeHead(304, etag).end()
    response.writeHead(route.status, { "content-type": route.type, ...etag }).end(route.body)
  }
}
