import { Plugin } from "@lox-nexus/plugin-sdk"
import { CreateVoucherAction } from "./actions/CreateVoucherAction.ts"
import { DeleteVoucherAction } from "./actions/DeleteVoucherAction.ts"
import { GuestAccessAction } from "./actions/GuestAccessAction.ts"
import { ListVouchersAction } from "./actions/ListVouchersAction.ts"
import { PowerCycleAction } from "./actions/PowerCycleAction.ts"
import { RestartDeviceAction } from "./actions/RestartDeviceAction.ts"
import { WifiSwitchAction } from "./actions/WifiSwitchAction.ts"
import { ACTUATORS, SENSORS } from "./Capabilities.ts"
import { ApiError } from "./api/ApiError.ts"
import { NetworkApi } from "./api/NetworkApi.ts"
import { UnifiClient } from "./api/UnifiClient.ts"
import { UnifiCatalog } from "./catalog/UnifiCatalog.ts"
import { ConsoleAddress } from "./config/ConsoleAddress.ts"
import { unifiConfigSchema, type UnifiConfig } from "./config/UnifiConfig.ts"
import { ConnectionTest } from "./ConnectionTest.ts"
import { ConsoleTransport } from "./http/ConsoleTransport.ts"
import { TlsPolicy } from "./http/TlsPolicy.ts"
import { UnifiPanel } from "./panel/UnifiPanel.ts"
import { NetworkPoller } from "./poll/NetworkPoller.ts"
import { PollDemand } from "./poll/PollDemand.ts"
import { SiteResolver } from "./poll/SiteResolver.ts"
import { DeviceCommands } from "./services/DeviceCommands.ts"
import { GuestAccess } from "./services/GuestAccess.ts"
import { WifiSwitch } from "./services/WifiSwitch.ts"
import { Vouchers } from "./vouchers/Vouchers.ts"

/**
 * A UniFi Network console through its official Integration API (`/v1`, API key): presence of
 * clients, device and port state, guest Wi-Fi, guest access, device restarts, PoE power-cycles
 * and hotspot vouchers. The API has no events, so one loop polls.
 */
export class UnifiPlugin extends Plugin<UnifiConfig> {
  static readonly config = unifiConfigSchema
  static readonly sensors = SENSORS
  static readonly actuators = ACTUATORS
  static readonly actions = [CreateVoucherAction, ListVouchersAction, DeleteVoucherAction, WifiSwitchAction, RestartDeviceAction, PowerCycleAction, GuestAccessAction]
  static readonly panelUpdates = "push"

  /** Test connection: reads the application info and finds the site; read only */
  static test(config: UnifiConfig) {
    return ConnectionTest.run(config)
  }

  readonly address = ConsoleAddress.parse(this.config.host)
  readonly tls = TlsPolicy.fromConfig(this.config)
  readonly transport = this.own(new ConsoleTransport(this.address, this.tls, this.config.apiKey, this.config.timeout * 1000))
  readonly api = new NetworkApi(new UnifiClient(this.transport))
  readonly site = new SiteResolver(this.api, this.config.site)
  readonly demand = new PollDemand()
  readonly poller = this.own(new NetworkPoller(this.api, this.site, this.demand, this.config.pollInterval * 1000,
    problem => this.problemChanged(problem), (message, data) => this.log.debug(message, data)))

  readonly commands = new DeviceCommands(this.api, this.site)
  readonly wifi = new WifiSwitch(this.api, this.site)
  readonly guests = new GuestAccess(this.api, this.site)
  readonly vouchers = new Vouchers(this.api, this.site, this.store)

  // A refused key fails the start (a restart can't fix it); an unreachable console doesn't, the
  // poll loop reports it as degraded and keeps trying.
  override async start() {
    // registered last, so it runs first on stop: the poller then needn't wait for a slow console
    this.onDispose(() => this.transport.close())
    await this.checkKey()
    this.listen(this.poller, "data", () => this.panelChanged())
    this.listen(this.poller, "failed", () => this.panelChanged())
    this.listen(this.vouchers, "created", () => this.panelChanged())
    this.poller.start()
  }

  override async catalog() {
    if (!this.poller.latest) await this.poller.poll()
    const latest = this.poller.latest
    if (!latest) throw new Error(`can't read the console: ${this.poller.problem ?? "no answer yet"}`)
    return new UnifiCatalog(latest, this.api, await this.site.id()).build()
  }

  override panel() {
    return new UnifiPanel(this.poller, {
      origin: this.address.origin,
      certificate: this.tls.describe(),
      site: this.site.current?.name,
      voucher: this.vouchers.last
    }).build()
  }

  private async checkKey() {
    try {
      this.poller.version = (await this.api.info()).applicationVersion
    } catch (error) {
      if (error instanceof ApiError && error.refusedKey) throw error
      this.log.debug("the console didn't answer at the start; the poll loop keeps trying", { problem: String(error) })
    }
  }

  private problemChanged(problem: string | undefined) {
    if (problem) {
      this.log.warn("can't read the UniFi console", { problem })
      this.status.set("degraded", `can't read the UniFi console: ${problem}`)
    } else {
      this.log.info("reading the UniFi console again")
      this.status.set("running")
    }
  }
}
