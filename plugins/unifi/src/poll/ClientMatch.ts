import type { Client } from "../api/ApiSchemas.ts"
import { MacAddress } from "../api/MacAddress.ts"
import type { ClientParams } from "../params/ClientParams.ts"

/**
 * Finds the client a signal follows among the connected clients. By name it ignores case and
 * outer spaces; several connected clients with that name count as one, the one connected last
 * first, because a phone with a rotating address may briefly show up twice.
 */
export class ClientMatch {
  constructor(private readonly params: ClientParams) {}

  /** the matching clients, the one connected last first; empty while none is connected */
  find(clients: readonly Client[]): Client[] {
    const wanted = this.params.client.trim().toLowerCase()
    const found = this.params.matchBy === "mac"
      ? clients.filter(client => MacAddress.equal(client.macAddress, wanted))
      : clients.filter(client => client.name.trim().toLowerCase() === wanted)
    return found.sort((a, b) => (b.connectedAt ?? "").localeCompare(a.connectedAt ?? ""))
  }

  /** for log lines and messages */
  describe() {
    return this.params.matchBy === "mac" ? MacAddress.normalize(this.params.client) : `"${this.params.client}"`
  }
}
