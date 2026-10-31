import { Actuator, Plugin, Sensor, secret, z, type CatalogNode } from "@lox-nexus/plugin-sdk"
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
  }
}

/**
 * A Home Assistant stand-in for the MCP tests: a catalog with a sensor, an actuator and an entry
 * with a secret param, and a secret setting with a default, so tests can check none of them leaks.
 * Runs in-process (FakePluginTransport), so `switched` records what the actuator received.
 */
export class HomePlugin extends Plugin<{ url: string; token: string }> {
  static readonly switched: boolean[] = []
  static readonly config = z.object({ url: z.string().default("http://ha"), token: secret(z.string()).default("planted-config-secret") })
  static readonly sensors = [Reading]
  static readonly actuators = [Switch]

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
