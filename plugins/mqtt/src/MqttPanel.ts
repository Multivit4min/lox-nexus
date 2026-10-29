import type { Panel } from "@lox-nexus/plugin-sdk"
import type { TrafficStats } from "./broker/TrafficStats.ts"
import type { ExportStats } from "./export/ExportStats.ts"

/** what the panel shows besides the stats objects */
export interface PanelFacts {
  /** the broker URL without credentials */
  target: string
  clientId: string
  username: string | undefined
  subscribedFilters: number
  sensorTopics: number
  browsing: string | undefined
  cached: number
  cacheLimit: number
  evicted: number
  watchedSignals: number
  baseTopic: string
  discovery: string
  pendingClears: number
}

/**
 * Three sections: the connection (state, broker, last error, message counters), the catalog's
 * browsing cache, and the export. Never shows the password; the target holds no credentials.
 */
export class MqttPanel {
  constructor(private readonly traffic: TrafficStats, private readonly exported: ExportStats, private readonly facts: PanelFacts) {}

  build(): Panel {
    return {
      type: "sections",
      sections: [
        { title: "Connection", panel: { type: "keyValue", items: this.connection() } },
        { title: "Browsing", panel: { type: "keyValue", items: this.browsing() } },
        { title: "Export", panel: { type: "keyValue", items: this.export() } }
      ]
    }
  }

  private connection() {
    const { traffic, facts } = this
    const error = traffic.lastError
    return [
      { label: "State", value: this.state() },
      { label: "Broker", value: facts.target },
      { label: "Client ID", value: facts.clientId },
      { label: "User", value: facts.username ?? "none (anonymous)" },
      { label: "Last error", value: error ? `${MqttPanel.time(error.at)}: ${error.message}` : "none" },
      { label: "Messages received", value: MqttPanel.count(traffic.received) },
      { label: "Messages published", value: `${MqttPanel.count(traffic.published)} (failed ${MqttPanel.count(traffic.publishFailed)})` },
      { label: "Subscriptions", value: `${MqttPanel.count(facts.subscribedFilters)} (topics read by sensors: ${MqttPanel.count(facts.sensorTopics)})` }
    ]
  }

  private browsing() {
    const { facts } = this
    return [
      { label: "Browsing", value: facts.browsing === undefined ? "not now (subscribed only while the catalog is open)" : `subscribed to ${facts.browsing}` },
      { label: "Topics kept", value: `${MqttPanel.count(facts.cached)} of ${MqttPanel.count(facts.cacheLimit)}` },
      { label: "Dropped (limit)", value: MqttPanel.count(facts.evicted) }
    ]
  }

  private export() {
    const { exported, facts } = this
    return [
      { label: "Watched signals", value: facts.watchedSignals === 0 ? "none chosen yet" : String(facts.watchedSignals) },
      { label: "Published to", value: `${facts.baseTopic}/<signal topic>` },
      { label: "Home Assistant discovery", value: facts.discovery },
      { label: "Values published", value: MqttPanel.count(exported.published) },
      { label: "Last published", value: MqttPanel.time(exported.lastPublishedAt) },
      { label: "Failed", value: MqttPanel.count(exported.failed) },
      { label: "Skipped (null or unknown signal)", value: MqttPanel.count(exported.skipped) },
      { label: "Dropped by Nexus (export behind)", value: MqttPanel.count(exported.droppedByNexus) },
      { label: "Retained topics removed", value: `${MqttPanel.count(exported.cleared)} (waiting: ${MqttPanel.count(facts.pendingClears)})` }
    ]
  }

  private state() {
    const { traffic } = this
    switch (traffic.state) {
      case "connected": return `connected since ${MqttPanel.time(traffic.connectedSince)}`
      case "waiting": return `disconnected; next attempt ${MqttPanel.time(traffic.nextAttemptAt)}`
      default: return traffic.state
    }
  }

  private static count(value: number) {
    return value.toLocaleString("en-US")
  }

  private static time(at: number | undefined) {
    return at === undefined ? "never" : new Date(at).toISOString()
  }
}
