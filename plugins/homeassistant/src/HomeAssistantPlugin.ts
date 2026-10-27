import { Plugin } from "@lox-nexus/plugin-sdk"
import { Actuators } from "./actuators/Actuators.ts"
import { HassCatalog } from "./catalog/HassCatalog.ts"
import { Registries } from "./catalog/Registries.ts"
import { HassConnection } from "./connection/HassConnection.ts"
import { EntityStore } from "./entities/EntityStore.ts"
import { homeAssistantConfigSchema, websocketUrl, type HomeAssistantConfig } from "./HomeAssistantConfig.ts"
import { HomeAssistantPanel } from "./HomeAssistantPanel.ts"
import { LightSensor } from "./sensors/LightSensor.ts"
import { StateSensor } from "./sensors/StateSensor.ts"

/**
 * Connects to Home Assistant over its WebSocket API: entity states and attributes as sensors,
 * service calls (lights, switches, covers, climate, scenes, …) as actuators, and a catalog of
 * every entity by area.
 */
export class HomeAssistantPlugin extends Plugin<HomeAssistantConfig> {
  static readonly config = homeAssistantConfigSchema
  static readonly sensors = [StateSensor, LightSensor]
  static readonly actuators = Actuators.all

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

  override async catalog() {
    return new HassCatalog(this.entities, await Registries.load(this.connection)).build()
  }

  override panel() {
    return new HomeAssistantPanel(this.connection, this.entities).build()
  }

  private connected() {
    this.log.info("connected to Home Assistant", { version: this.connection.version })
    this.status.set("running")
  }
}
