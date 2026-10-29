import { Disposable } from "@lox-nexus/plugin-sdk"
import type { BrokerConnection } from "../broker/BrokerConnection.ts"
import { Topic } from "../topics/Topic.ts"
import type { Subscriptions } from "../topics/Subscriptions.ts"
import { TopicCache, type CachedTopic } from "./TopicCache.ts"

/**
 * Subscribes to the browse filter only while someone browses: the first catalog request
 * subscribes and collects what the broker sends (retained messages come at once), later ones
 * within LINGER_MS see what arrived since. LINGER_MS after the last request it unsubscribes and
 * forgets the topics.
 */
export class TopicBrowser extends Disposable {
  /** the first request ends once no message came for QUIET_MS, at most COLLECT_MS after it began */
  static readonly QUIET_MS = 500
  static readonly COLLECT_MS = 3000
  static readonly LINGER_MS = 120_000

  readonly cache: TopicCache
  private browsing = false
  private refused = false
  private stopLinger: (() => void) | undefined
  /** while collecting: restarts the quiet time, and ends the collection */
  private collecting: { activity(): void; done(): void } | undefined

  constructor(private readonly connection: BrokerConnection, private readonly subscriptions: Subscriptions, private readonly filter: string, limit: number) {
    super()
    this.cache = new TopicCache(limit)
    this.listen(connection.events, "message", (topic: string, payload: Buffer, retained: boolean) => this.record(topic, payload, retained))
    this.listen(subscriptions.events, "refused", (refused: string) => {
      if (refused !== filter || !this.browsing) return
      this.refused = true
      this.collecting?.done()
    })
    this.onDispose(() => this.collecting?.done())
  }

  get active() {
    return this.browsing
  }

  /** the topics seen so far; subscribes first if needed */
  async topics(): Promise<CachedTopic[]> {
    if (!this.connection.connected) throw new Error("not connected to the broker, so there is nothing to browse")
    this.stopLinger?.()
    if (!this.browsing) {
      this.browsing = true
      this.subscriptions.acquire(this.filter)
      await this.collect()
    }
    if (this.refused) {
      this.end()
      throw new Error(`the broker refused the subscription to ${this.filter}; is this user allowed to read it?`)
    }
    // two requests at once: the later one's linger replaces the earlier one's, which must not end browsing early
    this.stopLinger?.()
    if (!this.isDisposed) this.stopLinger = this.after(TopicBrowser.LINGER_MS, () => this.end())
    return this.cache.list()
  }

  private record(topic: string, payload: Buffer, retained: boolean) {
    if (!this.browsing || !Topic.matches(this.filter, topic)) return
    this.cache.record(topic, payload, retained)
    this.collecting?.activity()
  }

  private collect() {
    return new Promise<void>(resolve => {
      const done = () => {
        this.collecting = undefined
        cancelAll()
        cancelQuiet()
        resolve()
      }
      const cancelAll = this.after(TopicBrowser.COLLECT_MS, done)
      let cancelQuiet = this.after(TopicBrowser.QUIET_MS, done)
      this.collecting = {
        done,
        activity: () => {
          cancelQuiet()
          cancelQuiet = this.after(TopicBrowser.QUIET_MS, done)
        }
      }
    })
  }

  private end() {
    this.stopLinger?.()
    this.stopLinger = undefined
    this.browsing = false
    this.refused = false
    this.subscriptions.release(this.filter)
    this.cache.clear()
  }
}
