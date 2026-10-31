import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { Client } from "../api/ApiSchemas.ts"
import { ClientMatch } from "../poll/ClientMatch.ts"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import { clientParamsSchema, type ClientParams } from "../params/ClientParams.ts"
import { PollSensor } from "./PollSensor.ts"

/**
 * Something about one client. The API lists connected clients only, so a client that isn't in
 * the list is away: `read()` gets undefined then.
 */
export abstract class ClientSensor extends PollSensor<ClientParams> {
  static readonly params = clientParamsSchema
  private readonly match = new ClientMatch(this.params)

  protected update(snapshot: NetworkSnapshot) {
    this.emit(this.read(this.match.find(snapshot.clients)[0], snapshot))
  }

  protected abstract read(client: Client | undefined, snapshot: NetworkSnapshot): Value
}
