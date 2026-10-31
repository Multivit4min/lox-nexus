import { Plugin } from "@lox-nexus/plugin-sdk"
import { FroniusCatalog } from "./catalog/FroniusCatalog.ts"
import { froniusConfigSchema, type FroniusConfig } from "./FroniusConfig.ts"
import { FroniusPanel } from "./FroniusPanel.ts"
import { Poller, type PollPart } from "./Poller.ts"
import { ValueSensor } from "./sensors/ValueSensor.ts"
import { SolarApi } from "./SolarApi.ts"

/**
 * Reads a Fronius inverter (GEN24, Symo, Primo, Tauro, Verto) or Datamanager over the local
 * Solar API v1: power flow, smart meters and batteries, polled on an interval.
 */
export class FroniusPlugin extends Plugin<FroniusConfig> {
  static readonly config = froniusConfigSchema
  static readonly sensors = [ValueSensor]
  /** the page refreshes after each poll instead of asking every 3 s */
  static readonly panelUpdates = "push"

  /** Test connection: one power flow read, the call every Fronius system answers */
  static async test(config: FroniusConfig) {
    const flow = await new SolarApi(config.host, config.timeout * 1000).powerFlow()
    const inverters = Object.keys(flow.Inverters ?? {}).length
    return `Connected to ${config.host}: ${inverters} inverter${inverters === 1 ? "" : "s"}, PV ${Math.round(flow.Site.P_PV ?? 0)} W`
  }

  readonly api = new SolarApi(this.config.host, this.config.timeout * 1000)
  readonly poller = this.own(new Poller(this.api, (part, problem) => this.problemChanged(part, problem), (message, data) => this.log.debug(message, data)))

  // The first poll isn't awaited: an inverter that is off (many sleep at night) must not fail the
  // start, and a hanging one must not hold it up. The instance starts degraded instead.
  override start() {
    this.listen(this.poller, "data", () => this.panelChanged())
    void this.poller.poll()
    this.every(this.config.pollInterval * 1000, () => void this.poller.poll())
  }

  override catalog() {
    return new FroniusCatalog(this.poller.latest).build()
  }

  override panel() {
    return new FroniusPanel(this.poller).build()
  }

  private problemChanged(part: PollPart, problem: string | undefined) {
    if (part === "powerflow") {
      this.panelChanged()
      if (problem) this.log.warn("can't read the inverter", { problem })
      else this.log.info("reading the inverter again")
      return problem ? this.status.set("degraded", problem) : this.status.set("running")
    }
    // meters and batteries are optional, so their absence is worth a line in the log, not a degraded instance
    if (problem) this.log.info(`no ${part} data, its values stay unchanged`, { problem })
    else this.log.info(`${part} data available again`)
  }
}
