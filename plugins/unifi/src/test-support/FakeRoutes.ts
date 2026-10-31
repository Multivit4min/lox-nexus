import type { Received } from "./FakeConsole.ts"
import { FakeConsoleState } from "./FakeConsoleState.ts"
import type { Json } from "./Fixtures.ts"

type Answer = { status: number; body?: unknown }
type Handler = (match: string[], request: Received) => Answer

/** The fake console's answers, per path, from its state. Unknown paths answer 404 like the API. */
export class FakeRoutes {
  private readonly table: [string, RegExp, Handler][]

  constructor(private readonly state: FakeConsoleState) {
    const site = "/v1/sites/([^/]+)"
    this.table = [
      ["GET", /^\/v1\/info$/, () => FakeRoutes.ok({ applicationVersion: "10.3.58" })],
      ["GET", /^\/v1\/sites$/, (_m, r) => FakeRoutes.ok(state.page(state.sites, r.query))],
      ["GET", new RegExp(`^${site}/clients$`), (_m, r) => FakeRoutes.ok(state.page(state.clients, r.query))],
      ["POST", new RegExp(`^${site}/clients/([^/]+)/actions$`), (m, r) => this.clientAction(m[2]!, r.body as Json)],
      ["GET", new RegExp(`^${site}/devices$`), (_m, r) => FakeRoutes.ok(state.page(state.devices, r.query))],
      ["GET", new RegExp(`^${site}/devices/([^/]+)$`), m => FakeRoutes.found(state.details[m[2]!])],
      ["GET", new RegExp(`^${site}/devices/([^/]+)/statistics/latest$`), m => FakeRoutes.found(state.statistics[m[2]!])],
      ["POST", new RegExp(`^${site}/devices/([^/]+)/actions$`), m => FakeRoutes.found(state.details[m[2]!] && {}, 200)],
      ["POST", new RegExp(`^${site}/devices/([^/]+)/interfaces/ports/(\\d+)/actions$`), m => FakeRoutes.found(state.details[m[2]!] && {}, 200)],
      ["GET", new RegExp(`^${site}/wifi/broadcasts$`), (_m, r) => FakeRoutes.ok(state.page(state.wifi.map(FakeConsoleState.wifiOverview), r.query))],
      ["GET", new RegExp(`^${site}/wifi/broadcasts/([^/]+)$`), m => FakeRoutes.found(this.wifi(m[2]!))],
      ["PUT", new RegExp(`^${site}/wifi/broadcasts/([^/]+)$`), (m, r) => this.putWifi(m[2]!, r.body as Json)],
      ["POST", new RegExp(`^${site}/hotspot/vouchers$`), (_m, r) => this.createVoucher(r.body as Json)],
      ["GET", new RegExp(`^${site}/hotspot/vouchers$`), (_m, r) => FakeRoutes.ok(state.page(state.vouchers, r.query))],
      ["DELETE", new RegExp(`^${site}/hotspot/vouchers$`), (_m, r) => this.deleteVouchers(r.query.get("filter") ?? "")]
    ]
  }

  answer(request: Received): Answer {
    if (this.state.failure) return { status: this.state.failure.status, body: this.state.failure.body }
    for (const [method, pattern, handler] of this.table) {
      const match = pattern.exec(request.path)
      if (!match || method !== request.method) continue
      if (match[1] !== undefined && !this.state.sites.some(site => site.id === match[1])) return FakeRoutes.notFound(request.path)
      return handler([...match], request)
    }
    return FakeRoutes.notFound(request.path)
  }

  /** the spec's "Error Message" */
  static error(statusCode: number, statusName: string, code: string, message: string, requestPath: string): Json {
    return { statusCode, statusName, code, message, timestamp: "2026-10-31T08:00:00Z", requestPath: `/integration${requestPath}` }
  }

  private clientAction(id: string, body: Json): Answer {
    const client = this.state.clients.find(entry => entry.id === id)
    if (!client) return FakeRoutes.notFound(id)
    const access = client.access as Json
    access.authorized = body.action === "AUTHORIZE_GUEST_ACCESS"
    const details = { authorizedAt: "2026-10-31T08:00:00Z", authorizationMethod: "API", expiresAt: "2026-11-01T08:00:00Z" }
    return FakeRoutes.ok(body.action === "AUTHORIZE_GUEST_ACCESS" ? { action: body.action, grantedAuthorization: details } : { action: body.action, revokedAuthorization: details })
  }

  private wifi(id: string) {
    return this.state.wifi.find(entry => entry.id === id)
  }

  // like the API, the id and metadata stay the console's own
  private putWifi(id: string, body: Json): Answer {
    const index = this.state.wifi.findIndex(entry => entry.id === id)
    if (index < 0) return FakeRoutes.notFound(id)
    const old = this.state.wifi[index]!
    this.state.wifi[index] = { ...body, id, metadata: old.metadata }
    return FakeRoutes.ok(this.state.wifi[index])
  }

  private createVoucher(body: Json): Answer {
    const voucher = { id: `00000000-0000-4000-8000-${String(501 + this.state.vouchers.length).padStart(12, "0")}`, createdAt: "2026-10-31T08:00:00Z",
      code: String(4861409510 + this.state.vouchers.length), authorizedGuestCount: 0, expired: false, ...body }
    delete (voucher as Json).count
    this.state.vouchers.push(voucher)
    return { status: 201, body: { vouchers: [voucher] } }
  }

  private deleteVouchers(filter: string): Answer {
    const code = /^code\.eq\('([^']*)'\)$/.exec(filter)?.[1]
    if (code === undefined) return { status: 400, body: FakeRoutes.error(400, "BAD_REQUEST", "api.request.invalid-filter", "Invalid filter", "/hotspot/vouchers") }
    const before = this.state.vouchers.length
    this.state.vouchers = this.state.vouchers.filter(voucher => voucher.code !== code)
    return FakeRoutes.ok({ vouchersDeleted: before - this.state.vouchers.length })
  }

  private static ok(body: unknown): Answer {
    return { status: 200, body }
  }

  private static found(body: unknown, status = 200): Answer {
    return body === undefined ? FakeRoutes.notFound("") : { status, body }
  }

  private static notFound(path: string): Answer {
    return { status: 404, body: FakeRoutes.error(404, "NOT_FOUND", "api.request.not-found", "Not found", path) }
  }
}
