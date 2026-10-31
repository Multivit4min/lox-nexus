import { Plugin } from "@lox-nexus/plugin-sdk"
import { Actuators } from "./actuators/Actuators.ts"
import { EventCatalog } from "./catalog/EventCatalog.ts"
import { HassCatalog } from "./catalog/HassCatalog.ts"
import { Registries } from "./catalog/Registries.ts"
import { HassConnection } from "./connection/HassConnection.ts"
import { HassAuthError, HassSocket } from "./connection/HassSocket.ts"
import { ServerFinder } from "./connection/ServerFinder.ts"
import { EntityStore } from "./entities/EntityStore.ts"
import { homeAssistantConfigSchema, websocketUrl, type HomeAssistantConfig } from "./HomeAssistantConfig.ts"
import { HomeAssistantPanel } from "./HomeAssistantPanel.ts"
import { EventSensor } from "./sensors/EventSensor.ts"
import { LightSensor } from "./sensors/LightSensor.ts"
import { StateSensor } from "./sensors/StateSensor.ts"

/**
 * Connects to Home Assistant over its WebSocket API: entity states, attributes and events as
 * sensors, service calls (lights, switches, covers, climate, scenes, helpers, to-do lists, …) as
 * actuators, and a catalog of every entity by area plus common event types.
 */
export class HomeAssistantPlugin extends Plugin<HomeAssistantConfig> {
  static readonly config = homeAssistantConfigSchema
  static readonly sensors = [StateSensor, LightSensor, EventSensor]
  static readonly actuators = Actuators.all

  /** Test connection: logs in over the WebSocket API like the plugin does, then closes; reads nothing */
  /** Find on the URL field: Home Assistant servers that announce themselves with mDNS */
  static async discover() {
    return await new ServerFinder().find()
  }

  static async test(config: HomeAssistantConfig) {
    const socket = await HassSocket.open(websocketUrl(config.url), config.token).catch((error: unknown) => {
      // each refused login counts towards Home Assistant's ip_ban_enabled, which would also lock out the running instance
      if (error instanceof HassAuthError) throw new Error(`${error.message}. Check the token before trying again: Home Assistant may block this address after repeated failed logins`)
      throw error
    })
    await socket.dispose()
    return `Connected to Home Assistant ${socket.version || ""}`.trim()
  }

  readonly entities = new EntityStore()
  readonly connection = this.own(new HassConnection(websocketUrl(this.config.url), this.config.token, this.entities, this.log))

  /**
   * Waits for the first connection attempt, so a wrong token fails the start (error state, no
   * restart). An unreachable Home Assistant starts degraded and keeps retrying.
   */
  override async start() {
    const events = this.connection.events
    this.listen(events, "connected", () => this.connected())
    this.listen(events, "disconnected", (reason: string) => this.status.set("degraded", `disconnected: ${reason}; reconnecting`))
    this.listen(events, "rejected", (reason: string) => {
      this.log.error("Home Assistant rejected the token; not retrying until the instance is restarted", { reason })
      this.status.set("degraded", `${reason}. Fix the token and restart the instance.`)
    })
    await this.connection.start()
  }

  /** every entity by area, then the events of common integrations */
  override async catalog() {
    const registries = await Registries.load(this.connection)
    return [...new HassCatalog(this.entities, registries).build(), ...new EventCatalog(registries).build()]
  }

  override panel() {
    return new HomeAssistantPanel(this.connection, this.entities).build()
  }

  private connected() {
    this.log.info("connected to Home Assistant", { version: this.connection.version })
    this.status.set("running")
  }
}
