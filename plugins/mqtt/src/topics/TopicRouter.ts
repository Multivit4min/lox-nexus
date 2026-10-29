import { Disposable } from "@lox-nexus/plugin-sdk"
import type { BrokerConnection } from "../broker/BrokerConnection.ts"
import { PayloadReader } from "../payload/PayloadReader.ts"
import type { Subscriptions } from "./Subscriptions.ts"

/** a message as the router hands it on */
export interface Message {
  topic: string
  payload: Buffer
  retained: boolean
}

/** a sensor's side of the router */
export interface TopicListener {
  message(message: Message): void
  refused(reason: string): void
}

/**
 * Hands messages of exact topics to the sensors listening to them. Keeps the last message of each
 * topic someone listens to (one per topic, dropped with the topic's last listener), so a sensor
 * added to a topic that is already subscribed gets the current value at once, as it would get the
 * retained message from the broker.
 */
export class TopicRouter extends Disposable {
  private readonly listeners = new Map<string, Set<TopicListener>>()
  private readonly last = new Map<string, Message>()
  private readonly refusals = new Map<string, string>()

  constructor(connection: BrokerConnection, private readonly subscriptions: Subscriptions) {
    super()
    this.listen(connection.events, "message", (topic: string, payload: Buffer, retained: boolean) => this.route({ topic, payload, retained }))
    this.listen(connection.events, "connected", () => this.refusals.clear())
    this.listen(subscriptions.events, "refused", (filter: string) => this.refuse(filter))
  }

  get topics() {
    return this.listeners.size
  }

  /** listens to a topic until the returned function is called */
  add(topic: string, listener: TopicListener): () => void {
    let set = this.listeners.get(topic)
    if (!set) {
      set = new Set()
      this.listeners.set(topic, set)
      this.subscriptions.acquire(topic)
    }
    set.add(listener)
    const refusal = this.refusals.get(topic)
    if (refusal) listener.refused(refusal)
    const last = this.last.get(topic)
    if (last) listener.message(last)
    return () => this.remove(topic, listener)
  }

  private remove(topic: string, listener: TopicListener) {
    const set = this.listeners.get(topic)
    if (!set?.delete(listener) || set.size > 0) return
    this.listeners.delete(topic)
    this.last.delete(topic)
    this.refusals.delete(topic)
    this.subscriptions.release(topic)
  }

  private route(message: Message) {
    const set = this.listeners.get(message.topic)
    if (!set) return
    // kept for sensors that join later only while a reader would take it (MQTT allows 256 MB)
    if (message.payload.length <= PayloadReader.MAX_BYTES) this.last.set(message.topic, message)
    else this.last.delete(message.topic)
    for (const listener of set) listener.message(message)
  }

  private refuse(topic: string) {
    const set = this.listeners.get(topic)
    if (!set) return
    const reason = "the broker refused the subscription (is this user allowed to read the topic?)"
    this.refusals.set(topic, reason)
    for (const listener of set) listener.refused(reason)
  }
}
