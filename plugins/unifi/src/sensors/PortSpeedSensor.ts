import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Port } from "../api/ApiSchemas.ts"
import { PortSensor } from "./PortSensor.ts"

/** The port's link speed in Mbit/s ("Port overview".speedMbps), 0 while the link is down. */
export class PortSpeedSensor extends PortSensor {
  static readonly id = "port-speed"
  static readonly label = "Port speed"
  static readonly description = "The port's link speed in Mbit/s, 0 while nothing is connected"
  static readonly valueType = "number"
  static readonly unit = "Mbit/s"
  static readonly decimals = 0

  protected readPort(port: Port) {
    return Value.number(port.state === "UP" ? port.speedMbps ?? 0 : 0)
  }
}
