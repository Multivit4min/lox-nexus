import type { Panel } from "@lox-nexus/plugin-sdk"
import type { EventSubscriptions } from "./connection/EventSubscriptions.ts"
import type { HassConnection } from "./connection/HassConnection.ts"
import type { EntityStore } from "./entities/EntityStore.ts"

/** The status view on the plugin's page: the connection and what it delivers. */
export class HomeAssistantPanel {
  constructor(
    private readonly connection: Pick<HassConnection, "connected" | "connectedSince" | "version" | "lastProblem" | "reconnects" | "busEvents">,
    private readonly entities: Pick<EntityStore, "size">
  ) {}

  build(): Panel {
    const { connected, connectedSince, version, lastProblem, reconnects, busEvents } = this.connection
    const items = [
      { label: "Connection", value: connected ? `connected since ${connectedSince?.toISOString()}` : "disconnected" },
      { label: "Home Assistant version", value: version || "–" },
      { label: "Entities", value: String(this.entities.size) },
      { label: "Event types followed", value: this.eventTypes(busEvents) },
      { label: "Reconnect attempts", value: String(reconnects) }
    ]
    if (lastProblem) items.push({ label: "Last problem", value: lastProblem })
    return { type: "keyValue", items }
  }

  /** e.g. "zha_event, call_service (refused)": only confirmed types go without a note */
  private eventTypes(busEvents: Pick<EventSubscriptions, "eventTypes" | "status">) {
    return busEvents.eventTypes.map(eventType => {
      const status = busEvents.status(eventType)
      return status === "subscribed" ? eventType : `${eventType} (${status})`
    }).join(", ") || "–"
  }
}
