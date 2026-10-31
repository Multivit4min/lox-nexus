import type { Cell, RowAction } from "@lox-nexus/plugin-sdk"
import { GuestAccessAction } from "../actions/GuestAccessAction.ts"
import type { Client } from "../api/ApiSchemas.ts"
import { MacAddress } from "../api/MacAddress.ts"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import type { Section } from "./PanelTypes.ts"

/** The connected clients (the API lists no others), with Authorize or Unauthorize on guests. */
export class ClientsSection {
  constructor(private readonly snapshot: NetworkSnapshot) {}

  sections(): Section[] {
    const clients = [...this.snapshot.clients].sort((a, b) => a.name.localeCompare(b.name))
    return [{
      title: "Connected clients",
      panel: {
        type: "table",
        columns: ["Name", "IP address", "MAC address", "Connected to", "Type", "Access", "Connected"],
        rows: clients.map(client => this.row(client)),
        rowActions: clients.map(client => ClientsSection.actions(client))
      }
    }]
  }

  private row(client: Client): Cell[] {
    const connected = client.connectedAt ? Date.parse(client.connectedAt) : NaN
    return [
      client.name,
      client.ipAddress ?? "",
      client.macAddress ? MacAddress.normalize(client.macAddress) : "",
      this.snapshot.uplinkOf(client),
      client.type.toLowerCase(),
      ClientsSection.access(client),
      Number.isFinite(connected) ? { text: client.connectedAt, since: connected } : ""
    ]
  }

  private static access(client: Client): Cell {
    if (client.access.type !== "GUEST") return { text: "member", tone: "muted" }
    return client.access.authorized ? { text: "guest, authorized", tone: "ok" } : { text: "guest, not authorized", tone: "warn" }
  }

  // the dialog opens filled in, so the minutes can still be set
  private static actions(client: Client): RowAction[] {
    if (client.access.type !== "GUEST" || !client.macAddress) return []
    const authorize = !client.access.authorized
    return [{
      action: GuestAccessAction.id,
      label: authorize ? "Authorize" : "Unauthorize",
      input: { client: MacAddress.normalize(client.macAddress), matchBy: "mac", authorize }
    }]
  }
}
