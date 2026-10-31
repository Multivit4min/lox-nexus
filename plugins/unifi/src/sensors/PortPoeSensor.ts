import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Device, Port } from "../api/ApiSchemas.ts"
import { PortSensor } from "./PortSensor.ts"

/** Whether the port supplies power: "Port PoE overview".state, UP, DOWN, LIMITED or UNKNOWN; OFF when PoE is switched off. */
export class PortPoeSensor extends PortSensor {
  static readonly id = "port-poe"
  static readonly label = "Port PoE state"
  static readonly description = "Whether the port powers its device: UP, DOWN, LIMITED, UNKNOWN, or OFF when PoE is switched off"
  static readonly valueType = "string"

  protected readPort(port: Port, device: Device) {
    if (!port.poe) return { problem: `port ${port.idx} of ${device.name} has no PoE` }
    return Value.string(port.poe.enabled ? port.poe.state : "OFF")
  }
}
