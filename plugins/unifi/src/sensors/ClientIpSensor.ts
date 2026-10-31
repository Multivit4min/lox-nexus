import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Client } from "../api/ApiSchemas.ts"
import { ClientSensor } from "./ClientSensor.ts"

/** The client's IP address, empty while it is away (or before it has one). */
export class ClientIpSensor extends ClientSensor {
  static readonly id = "client-ip"
  static readonly label = "Client IP address"
  static readonly description = "The client's IP address, empty while it is away"
  static readonly valueType = "string"

  protected read(client: Client | undefined) {
    return Value.string(client?.ipAddress ?? "")
  }
}
