import { EventEmitter } from "node:events"
import { Disposable, type PluginLogger } from "@lox-nexus/plugin-sdk"
import type { BrokerConnection } from "../broker/BrokerConnection.ts"

/**
 * The filters the plugin is subscribed to, counted: the first user subscribes, the last one to
 * leave unsubscribes, so sensors on one topic and the catalog's browsing share a subscription
 * without one ending the other's. After every connect all are subscribed again (sessions are clean).
 *
 * `events`: "refused" (filter) when the broker refuses a subscription (an ACL, usually).
 */
export class Subscriptions extends Disposable {
  /** filters per SUBSCRIBE packet when subscribing again */
  static readonly CHUNK = 100
  readonly events = new EventEmitter()
  private readonly counts = new Map<string, number>()

  constructor(private readonly connection: BrokerConnection, private readonly log: PluginLogger) {
    super()
    this.events.setMaxListeners(0)
    this.listen(connection.events, "connected", () => void this.subscribeAll())
  }

  get size() {
    return this.counts.size
  }

  acquire(filter: string) {
    const count = this.counts.get(filter) ?? 0
    this.counts.set(filter, count + 1)
    if (count === 0) void this.subscribe([filter])
  }

  release(filter: string) {
    const count = this.counts.get(filter)
    if (count === undefined) return
    if (count > 1) return void this.counts.set(filter, count - 1)
    this.counts.delete(filter)
    this.connection.unsubscribe([filter]).catch((error: unknown) => this.warn("unsubscribing failed", [filter], error))
  }

  private async subscribeAll() {
    const filters = [...this.counts.keys()]
    for (let start = 0; start < filters.length; start += Subscriptions.CHUNK) {
      await this.subscribe(filters.slice(start, start + Subscriptions.CHUNK))
    }
  }

  private async subscribe(filters: string[]) {
    try {
      const refused = await this.connection.subscribe(filters)
      for (const filter of refused) {
        this.log.warn("the broker refused a subscription", { filter })
        this.events.emit("refused", filter)
      }
    } catch (error) {
      this.warn("subscribing failed", filters, error)
    }
  }

  private warn(message: string, filters: string[], error: unknown) {
    if (this.isDisposed) return
    this.log.warn(message, { filters: filters.slice(0, 10), error: error instanceof Error ? error.message : String(error) })
  }
}
