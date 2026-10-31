import { z } from "@lox-nexus/plugin-sdk"
import {
  applicationInfoSchema, clientSchema, deviceDetailsSchema, deviceSchema, siteSchema, statisticsSchema, voucherCreationSchema,
  voucherDeletionSchema, voucherSchema, wifiDetailsSchema, wifiOverviewSchema, type WifiDetails
} from "./ApiSchemas.ts"
import type { UnifiClient } from "./UnifiClient.ts"

/** what a voucher is created with ("Hotspot voucher creation request") */
export interface VoucherRequest {
  name: string
  timeLimitMinutes: number
  count?: number
  authorizedGuestLimit?: number
  dataUsageLimitMBytes?: number
  rxRateLimitKbps?: number
  txRateLimitKbps?: number
}

const anything = z.unknown()

/**
 * The endpoints of the official UniFi Network Integration API (`/v1/…`) the plugin uses, and only
 * those. Site-scoped calls take the site's id (a UUID), never its name.
 */
export class NetworkApi {
  constructor(private readonly client: UnifiClient) {}

  info() {
    return this.client.call({ method: "GET", path: "/v1/info" }, applicationInfoSchema, "reading the application info")
  }

  sites() {
    return this.client.list("/v1/sites", siteSchema, "listing the sites")
  }

  /** the connected clients: a client that isn't connected is not in the list */
  clients(site: string) {
    return this.client.list(`${NetworkApi.site(site)}/clients`, clientSchema, "listing the clients")
  }

  devices(site: string) {
    return this.client.list(`${NetworkApi.site(site)}/devices`, deviceSchema, "listing the devices")
  }

  device(site: string, device: string) {
    return this.client.call({ method: "GET", path: this.devicePath(site, device) }, deviceDetailsSchema, "reading the device")
  }

  statistics(site: string, device: string) {
    return this.client.call({ method: "GET", path: `${this.devicePath(site, device)}/statistics/latest` }, statisticsSchema, "reading the device statistics")
  }

  /** "Device restart request" */
  restart(site: string, device: string) {
    return this.client.call({ method: "POST", path: `${this.devicePath(site, device)}/actions`, body: { action: "RESTART" } }, anything, "restarting the device")
  }

  /** "Port PoE power-cycle request" */
  powerCycle(site: string, device: string, port: number) {
    const path = `${this.devicePath(site, device)}/interfaces/ports/${port}/actions`
    return this.client.call({ method: "POST", path, body: { action: "POWER_CYCLE" } }, anything, `power-cycling port ${port}`)
  }

  /** "Guest access authorization request" (with a time limit) or "Guest access unauthorization request" */
  guestAccess(site: string, client: string, authorize: boolean, minutes?: number) {
    const body = authorize
      ? { action: "AUTHORIZE_GUEST_ACCESS", ...(minutes === undefined ? {} : { timeLimitMinutes: minutes }) }
      : { action: "UNAUTHORIZE_GUEST_ACCESS" }
    const path = `${NetworkApi.site(site)}/clients/${encodeURIComponent(client)}/actions`
    return this.client.call({ method: "POST", path, body }, anything, authorize ? "authorizing the guest" : "unauthorizing the guest")
  }

  wifiBroadcasts(site: string) {
    return this.client.list(`${NetworkApi.site(site)}/wifi/broadcasts`, wifiOverviewSchema, "listing the Wi-Fi networks")
  }

  wifiBroadcast(site: string, id: string) {
    return this.client.call({ method: "GET", path: this.wifiPath(site, id) }, wifiDetailsSchema, "reading the Wi-Fi network")
  }

  /** PUT replaces the whole broadcast ("Wifi broadcast create or update"), so `body` is the full object */
  updateWifiBroadcast(site: string, id: string, body: Omit<WifiDetails, "id">) {
    return this.client.call({ method: "PUT", path: this.wifiPath(site, id), body }, wifiDetailsSchema, "updating the Wi-Fi network")
  }

  createVoucher(site: string, request: VoucherRequest) {
    const path = `${NetworkApi.site(site)}/hotspot/vouchers`
    return this.client.call({ method: "POST", path, body: { count: 1, ...request } }, voucherCreationSchema, "creating the voucher")
  }

  vouchers(site: string) {
    return this.client.list(`${NetworkApi.site(site)}/hotspot/vouchers`, voucherSchema, "listing the vouchers")
  }

  /** deletes the vouchers the filter matches, e.g. `code.eq('12345')` */
  deleteVouchers(site: string, filter: string) {
    const path = `${NetworkApi.site(site)}/hotspot/vouchers`
    return this.client.call({ method: "DELETE", path, query: { filter } }, voucherDeletionSchema, "deleting the voucher")
  }

  private devicePath(site: string, device: string) {
    return `${NetworkApi.site(site)}/devices/${encodeURIComponent(device)}`
  }

  private wifiPath(site: string, id: string) {
    return `${NetworkApi.site(site)}/wifi/broadcasts/${encodeURIComponent(id)}`
  }

  private static site(site: string) {
    return `/v1/sites/${encodeURIComponent(site)}`
  }
}
