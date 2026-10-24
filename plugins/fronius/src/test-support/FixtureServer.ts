import { readFileSync } from "node:fs"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

type Route = { status: number; type: string; body: string }

/**
 * A fake inverter on 127.0.0.1 (port 0) answering Solar API requests from the recorded-style
 * fixtures in test/fixtures. Routes are keyed by endpoint name ("GetPowerFlowRealtimeData"),
 * optionally with the query ("GetMeterRealtimeData?Scope=Device&DeviceId=0"), which wins.
 */
export class FixtureServer {
  /** path and query of every request, in order of arrival */
  readonly requests: string[] = []
  private readonly routes = new Map<string, Route>()
  private gate: Promise<void> | undefined
  private readonly server = createServer((request, response) => void this.handle(request, response))

  private constructor() {}

  static async start() {
    const fixture = new FixtureServer()
    await new Promise<void>(resolve => fixture.server.listen(0, "127.0.0.1", resolve))
    return fixture
  }

  static fixture(name: string) {
    return readFileSync(new URL(`../../test/fixtures/${name}.json`, import.meta.url), "utf8")
  }

  get url() {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  /** a GEN24 with smart meter and battery */
  gen24() {
    return this.serve("GetPowerFlowRealtimeData", "powerflow-gen24")
      .serve("GetMeterRealtimeData", "meter-system")
      .serve("GetStorageRealtimeData", "storage-system")
  }

  /** an inverter without meter, and a Datamanager that doesn't know the storage endpoint */
  produceOnly() {
    return this.serve("GetPowerFlowRealtimeData", "powerflow-produce-only")
      .serve("GetMeterRealtimeData", "empty-system")
      .fail("GetStorageRealtimeData", 404)
  }

  serve(route: string, fixture: string, type = "application/json") {
    this.routes.set(route, { status: 200, type, body: FixtureServer.fixture(fixture) })
    return this
  }

  fail(route: string, status = 500) {
    this.routes.set(route, { status, type: "text/plain", body: "failed on purpose" })
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
    const url = new URL(request.url ?? "/", "http://fixture")
    this.requests.push(`${url.pathname}${url.search}`)
    await this.gate
    const name = url.pathname.match(/^\/solar_api\/v1\/(\w+)\.f?cgi$/)?.[1] ?? ""
    const route = this.routes.get(`${name}${url.search}`) ?? this.routes.get(name)
    if (!route) return response.writeHead(404).end()
    response.writeHead(route.status, { "content-type": route.type }).end(route.body)
  }
}
