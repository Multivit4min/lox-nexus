import { EventEmitter } from "node:events"
import { Action, Actuator, Plugin, Sensor, secret, z, type CatalogNode, type Panel } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"

class Reading extends Sensor<HomePlugin, { entity: string; apiKey?: string }> {
  static readonly id = "reading"
  static readonly params = z.object({ entity: z.string(), apiKey: secret(z.string()).optional() })
  static readonly valueType = "number"
  override start() {
    this.emit(Value.number(21.5))
  }
}

class Switch extends Actuator<HomePlugin, { entity: string }, Extract<Value, { type: "boolean" }>> {
  static readonly id = "switch"
  static readonly params = z.object({ entity: z.string() })
  static readonly accepts = "boolean"
  run(value: Extract<Value, { type: "boolean" }>) {
    HomePlugin.switched.push(value.value)
    HomePlugin.events.emit("switched", value.value)
  }
}

class RefreshAction extends Action<HomePlugin, { entity: string }> {
  static readonly id = "refresh"
  static readonly input = z.object({ entity: z.string() })
  run() {
    return `refreshed ${this.input.entity}`
  }
}

// asks first, and answers with a code, like opening a Matter pairing window
class PairAction extends Action<HomePlugin> {
  static readonly id = "pair"
  static readonly confirm = "Open a pairing window for 3 minutes?"
  run() {
    return { message: "pairing code 3497-011-2332", panel: { type: "qr" as const, data: "MT:planted-qr", caption: "Scan to pair" } }
  }
}

/**
 * A Home Assistant stand-in for the MCP tests: a catalog with a sensor, an actuator and an entry
 * with a secret param, and a secret setting with a default, so tests can check none of them leaks.
 * Runs in-process (FakePluginTransport), so `switched` records what the actuator received, and
 * `events` says so ("switched").
 */
export class HomePlugin extends Plugin<{ url: string; token: string }> {
  static readonly switched: boolean[] = []
  static readonly events = new EventEmitter()
  static readonly config = z.object({ url: z.string().default("http://ha"), token: secret(z.string()).default("planted-config-secret") })
  static readonly sensors = [Reading]
  static readonly actuators = [Switch]
  static readonly actions = [RefreshAction, PairAction]

  // an instance whose url mentions "leak" writes its token into its status, as a careless plugin might
  override start() {
    this.log.info(`connected to ${this.config.url}`)
    if (this.config.url.includes("leak")) this.status.set("degraded", `cannot reach ${this.config.url} with ${this.config.token}`)
  }

  override panel(): Panel {
    return { type: "sections", sections: [
      { title: "Connection", panel: { type: "keyValue", items: [{ label: "Server", value: { text: this.config.url, tone: "ok" } }] } },
      { title: "Pairing", panel: { type: "qr", data: "MT:planted-pairing-code", caption: "Scan to pair" } }
    ] }
  }

  override catalog(): CatalogNode[] {
    return [
      { label: "Kitchen", entries: [
        { kind: "sensor", capability: "reading", params: { entity: "sensor.kitchen_temperature" }, label: "Kitchen temperature", value: Value.number(21.5), unit: "°C" },
        { kind: "actuator", capability: "switch", params: { entity: "switch.kitchen_light" }, label: "Kitchen light" }
      ] },
      { label: "Garage", entries: [{ kind: "sensor", capability: "reading", params: { entity: "sensor.door", apiKey: "planted-param-secret" }, label: "Garage door" }] }
    ]
  }
}
