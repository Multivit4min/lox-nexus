import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Client } from "../api/ApiSchemas.ts"
import { ClientSensor } from "./ClientSensor.ts"

/**
 * Presence: true while the client is connected. Phones drop off Wi-Fi while they sleep, so wire it
 * through the wire's debounce transform for "away after N minutes" rather than using it raw.
 */
export class ClientConnectedSensor extends ClientSensor {
  static readonly id = "client-connected"
  static readonly label = "Client connected"
  static readonly description = "true while the client is connected to the network (presence)"
  static readonly valueType = "boolean"

  protected read(client: Client | undefined) {
    return Value.boolean(client !== undefined)
  }
}
