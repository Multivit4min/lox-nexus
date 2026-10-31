import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Port } from "../api/ApiSchemas.ts"
import { PortSensor } from "./PortSensor.ts"

/** true while the port's link is up ("Port overview".state UP). */
export class PortLinkSensor extends PortSensor {
  static readonly id = "port-link"
  static readonly label = "Port link"
  static readonly description = "true while something is connected to the port and its link is up"
  static readonly valueType = "boolean"

  protected readPort(port: Port) {
    return Value.boolean(port.state === "UP")
  }
}
