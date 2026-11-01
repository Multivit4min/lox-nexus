import { EventEmitter } from "node:events"
import { Plugin, type CatalogNode, type Panel } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { SwitchActuator } from "./actuators/SwitchActuator.ts"
import { PlugClient, type PlugStatus } from "./PlugClient.ts"
import { MeterSensor } from "./sensors/MeterSensor.ts"
import { SwitchedOnSensor } from "./sensors/SwitchedOnSensor.ts"
import { smartPlugConfig, type SmartPlugConfig } from "./SmartPlugConfig.ts"

/**
 * One smart plug: reads it every few seconds and hands each reading to the sensors, and switches
 * it for the actuator. The plugin reads the plug once for all sensors, so ten signals don't mean
 * ten requests.
 */
export class SmartPlugPlugin extends Plugin<SmartPlugConfig> {
  // #region declarations
  static readonly config = smartPlugConfig
  static readonly sensors = [MeterSensor, SwitchedOnSensor]
  static readonly actuators = [SwitchActuator]
  // #endregion

  // #region test
  /** the settings form's Test button: runs with what the user typed, before anything is saved */
  static async test(config: SmartPlugConfig) {
    const status = await new PlugClient(config.address).status()
    return `Connected to "${status.name}", which is ${status.on ? "on" : "off"}`
  }
  // #endregion

  // #region state
  readonly client = new PlugClient(this.config.address)
  /** emits "reading" with each PlugStatus */
  readonly readings = new EventEmitter<{ reading: [PlugStatus] }>()
  latest: PlugStatus | undefined
  lastRead: number | undefined
  problem: string | undefined
  private polls = 0
  private newest = 0
  // #endregion

  // #region start
  // Not awaited: a plug that is unplugged must not fail the start. The instance shows as degraded
  // instead, and recovers on its own once a reading works again.
  override start() {
    void this.poll()
    this.every(this.config.pollSeconds * 1000, () => void this.poll())
  }
  // #endregion

  // #region poll
  async poll() {
    // A reading that started earlier can finish later (the switch reads at once while a timed
    // reading is under way). Only the newest one counts, or "Switched on" would flip back.
    const poll = ++this.polls
    try {
      // #region poll-ok
      const status = await this.client.status()
      if (poll < this.newest) return
      this.newest = poll
      this.latest = status
      this.lastRead = this.clock.now()
      if (this.problem) this.log.info("the plug answers again")
      this.problem = undefined
      this.status.set("running")
      this.readings.emit("reading", this.latest)
      // #endregion
    } catch (error) {
      // #region poll-failed
      if (poll < this.newest) return
      this.newest = poll
      const problem = error instanceof Error ? error.message : String(error)
      // a plug that stays away is logged once, not every few seconds
      if (problem !== this.problem) this.log.warn("can't read the plug", { problem })
      this.problem = problem
      this.status.set("degraded", problem)
      // #endregion
    }
  }
  // #endregion

  // #region catalog
  /** what the user can pick from when adding signals, with the values the plug reports now */
  override catalog(): CatalogNode[] {
    const now = this.latest
    return [{
      label: now?.name ?? "Plug",
      entries: [
        { kind: "sensor", capability: "meter", params: { reading: "power" }, label: "Power", unit: "W", ...(now ? { value: Value.number(now.power) } : {}) },
        { kind: "sensor", capability: "meter", params: { reading: "energy" }, label: "Energy", unit: "kWh", ...(now ? { value: Value.number(now.energy) } : {}) },
        { kind: "sensor", capability: "switched-on", params: {}, label: "Switched on", ...(now ? { value: Value.boolean(now.on) } : {}) },
        { kind: "actuator", capability: "switch", params: {}, label: "Switch" }
      ]
    }]
  }
  // #endregion

  // #region panel
  /** the status page on the instance's page */
  override panel(): Panel {
    const now = this.latest
    return {
      type: "keyValue",
      items: [
        { label: "Plug", value: now?.name ?? "not read yet" },
        { label: "State", value: this.problem ? { text: this.problem, tone: "error" } : { text: now?.on ? "on" : "off", tone: now?.on ? "ok" : "muted" } },
        { label: "Power", value: now ? `${now.power} W` : "–" },
        { label: "Energy", value: now ? `${now.energy} kWh` : "–" },
        { label: "Last reading", value: this.lastRead !== undefined ? { at: this.lastRead } : { text: "never", tone: "muted" } }
      ]
    }
  }
  // #endregion
}
