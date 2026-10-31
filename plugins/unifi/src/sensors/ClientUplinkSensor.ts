import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Client } from "../api/ApiSchemas.ts"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import { ClientSensor } from "./ClientSensor.ts"

/** Where the client is: the name of its access point or switch ("VPN" for VPN clients), empty while away. */
export class ClientUplinkSensor extends ClientSensor {
  static readonly id = "client-uplink"
  static readonly label = "Client connected to"
  static readonly description = "The access point or switch the client is connected to, empty while it is away"
  static readonly valueType = "string"

  protected read(client: Client | undefined, snapshot: NetworkSnapshot) {
    return Value.string(client ? snapshot.uplinkOf(client) : "")
  }
}
