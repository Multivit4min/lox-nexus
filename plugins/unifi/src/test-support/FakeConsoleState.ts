import { Fixtures, type Json } from "./Fixtures.ts"

/** What the fake console knows: the fixtures, as plain objects a test may change. */
export class FakeConsoleState {
  sites = Fixtures.load<Json[]>("sites")
  clients = Fixtures.load<Json[]>("clients")
  devices = Fixtures.load<Json[]>("devices")
  details = Fixtures.load<Record<string, Json>>("device-details")
  statistics = Fixtures.load<Record<string, Json>>("statistics")
  wifi = Fixtures.load<Json[]>("wifi-broadcasts")
  vouchers: Json[] = []
  /** the most a page holds, below the asked limit, to make the plugin page */
  pageLimit = 200
  /** answers every request with this, e.g. { status: 500 }, while set */
  failure: { status: number; body?: Json } | undefined
  /** while set, requests are received but never answered, to make the plugin time out */
  hang = false

  /** the spec's page envelope around one page of `items` */
  page(items: Json[], query: URLSearchParams): Json {
    const offset = Number(query.get("offset") ?? 0)
    const limit = Math.min(Number(query.get("limit") ?? 25), this.pageLimit)
    const data = items.slice(offset, offset + limit)
    return { offset, limit, count: data.length, totalCount: items.length, data }
  }

  /** "Wifi broadcast overview" of a details object */
  static wifiOverview(details: Json): Json {
    const security = details.securityConfiguration as Json
    const { id, name, type, enabled, metadata, network } = details
    return { id, name, type, enabled, metadata, network, securityConfiguration: { type: security.type } }
  }
}
