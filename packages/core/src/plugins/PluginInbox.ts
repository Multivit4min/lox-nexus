import type { PluginHealth, WorkerMessage } from "@lox-nexus/plugin-sdk/wire"
import type { PluginSignals } from "./PluginSignals.ts"
import type { PluginInstanceConfig, PluginLogSink, PluginStateStore } from "./PluginTypes.ts"

/** Where the inbox delivers what a plugin reports. */
export interface InboxTarget {
  instance: () => PluginInstanceConfig
  signals: PluginSignals
  store: PluginStateStore
  logs: PluginLogSink
  /** a problem worth showing on the instance's error topic */
  report: (text: string) => void
  /** the plugin reported another health */
  healthChanged: (health: PluginHealth) => void
}

/**
 * Routes what a running plugin reports (values, logs, store writes, status, failed signals) and
 * remembers the plugin's own health, including what it reported before it was ready. It never
 * throws: messages arrive in the worker's event callback, where an exception would take the
 * whole server down, so a failure (say, a store write the database refuses) is reported instead.
 */
export class PluginInbox {
  private current: PluginHealth = "running"

  constructor(private readonly target: InboxTarget) {}

  /** the plugin's last self-reported health; "running" until it says otherwise */
  get health() {
    return this.current
  }

  /** forgets the previous worker's health, for a fresh start */
  reset() {
    this.current = "running"
  }

  receive(message: WorkerMessage) {
    try {
      this.route(message)
    } catch (error) {
      this.target.report(`handling a "${message.type}" message failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private route(message: WorkerMessage) {
    const { signals, store, logs } = this.target
    const instance = this.target.instance()
    switch (message.type) {
      case "emit": return signals.publish(message.signalId, message.value, message.causeId)
      case "log": return logs.log(instance, message.level, message.message, message.data)
      case "store.set": return store.set(instance.id, message.key, message.value)
      case "store.delete": return store.delete(instance.id, message.key)
      case "signal.error":
        signals.setError(message.signalId, message.error)
        return this.target.report(`signal "${message.signalId}" failed: ${message.error}`)
      case "status":
        this.current = message.status
        if (message.status === "degraded") this.target.report(message.message ?? "degraded")
        return this.target.healthChanged(message.status)
    }
  }
}
