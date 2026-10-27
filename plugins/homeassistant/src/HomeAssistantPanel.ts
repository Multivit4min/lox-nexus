import type { Panel } from "@lox-nexus/plugin-sdk"
import type { HassConnection } from "./connection/HassConnection.ts"
import type { EntityStore } from "./entities/EntityStore.ts"

/** The status view on the plugin's page: the connection and what it delivers. */
export class HomeAssistantPanel {
  constructor(
    private readonly connection: Pick<HassConnection, "connected" | "connectedSince" | "version" | "lastProblem" | "reconnects">,
    private readonly entities: Pick<EntityStore, "size">
  ) {}

  build(): Panel {
    const { connected, connectedSince, version, lastProblem, reconnects } = this.connection
    const items = [
      { label: "Connection", value: connected ? `connected since ${connectedSince?.toISOString()}` : "disconnected" },
      { label: "Home Assistant version", value: version || "–" },
      { label: "Entities", value: String(this.entities.size) },
      { label: "Reconnect attempts", value: String(reconnects) }
    ]
    if (lastProblem) items.push({ label: "Last problem", value: lastProblem })
    return { type: "keyValue", items }
  }
}
