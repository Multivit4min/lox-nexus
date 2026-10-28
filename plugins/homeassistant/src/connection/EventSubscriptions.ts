import type { PluginLogger } from "@lox-nexus/plugin-sdk"
import { BusEventSchema } from "./HassMessages.ts"
import { HassError, type HassSocket } from "./HassSocket.ts"

/** What a user of an event type hears: its events, and whether Home Assistant accepted the subscription. */
export interface BusEventListener {
  /** the event's `data` */
  event(data: Record<string, unknown>): void
  /** subscribed (again, after a reconnect): a refusal reported earlier is over */
  subscribed(): void
  /** Home Assistant refused the subscription, e.g. for a token of a user who isn't an admin */
  refused(message: string): void
}

/** one event type in use; `id` is its subscription on the current socket, once confirmed; `refusal` Home Assistant's last no */
type Subscription = { readonly listeners: Set<BusEventListener>; id?: number; refusal?: string }

/**
 * `subscribe_events` per event type in use, shared by every listener of that type: the first
 * listener subscribes, the last one leaving unsubscribes, and each new socket (every reconnect)
 * subscribes again to every type still in use, since Home Assistant forgets subscriptions with
 * the connection. A refused type is tried again only on the next connection, or when it is added
 * anew after its last listener left.
 */
export class EventSubscriptions {
  private readonly types = new Map<string, Subscription>()
  private socket: HassSocket | undefined

  constructor(private readonly log: Pick<PluginLogger, "warn">) {}

  /** the event types in use, subscribed or about to be */
  get eventTypes() {
    return [...this.types.keys()]
  }

  /** whether Home Assistant confirmed a type in use, refused it, or hasn't answered yet (also while disconnected) */
  status(eventType: string): "subscribed" | "refused" | "pending" | undefined {
    const subscription = this.types.get(eventType)
    if (!subscription) return undefined
    if (subscription.id !== undefined) return "subscribed"
    return subscription.refusal === undefined ? "pending" : "refused"
  }

  /** starts listening to an event type; returns the function that stops it */
  add(eventType: string, listener: BusEventListener): () => void {
    let subscription = this.types.get(eventType)
    if (!subscription) {
      subscription = { listeners: new Set() }
      this.types.set(eventType, subscription)
      if (this.socket) void this.subscribe(eventType, subscription, this.socket)
    }
    const added = subscription
    added.listeners.add(listener)
    // a later sensor of a refused type learns it too, not only those there when it was refused
    if (added.refusal !== undefined) listener.refused(added.refusal)
    return () => this.remove(eventType, added, listener)
  }

  /** a new session: subscribes every type in use on it */
  attach(socket: HassSocket) {
    this.socket = socket
    for (const [eventType, subscription] of this.types) void this.subscribe(eventType, subscription, socket)
  }

  /** the session ended, and its subscriptions with it */
  detach() {
    this.socket = undefined
    for (const subscription of this.types.values()) delete subscription.id
  }

  private async subscribe(eventType: string, subscription: Subscription, socket: HassSocket) {
    let id: number
    try {
      id = await socket.subscribe({ type: "subscribe_events", event_type: eventType }, event => this.deliver(eventType, subscription, event))
    } catch (error) {
      // a lost connection (or a type no longer in use) needs nothing: the next connection subscribes again
      if (!this.current(eventType, subscription, socket)) return
      if (!(error instanceof HassError)) {
        // no answer on a live connection: a late confirmation would leave events nobody takes, so start over cleanly
        return socket.close(`didn't confirm subscribe_events for ${eventType}`)
      }
      subscription.refusal = `Home Assistant refused to subscribe to ${eventType}: ${error.message}`
      for (const listener of subscription.listeners) listener.refused(subscription.refusal)
      return
    }
    // the last listener left (or the session ended) while Home Assistant was answering
    if (!this.current(eventType, subscription, socket)) return void socket.unsubscribe(id).catch(() => undefined)
    subscription.id = id
    delete subscription.refusal
    for (const listener of subscription.listeners) listener.subscribed()
  }

  private current(eventType: string, subscription: Subscription, socket: HassSocket) {
    return this.types.get(eventType) === subscription && this.socket === socket
  }

  private remove(eventType: string, subscription: Subscription, listener: BusEventListener) {
    subscription.listeners.delete(listener)
    if (subscription.listeners.size > 0 || this.types.get(eventType) !== subscription) return
    this.types.delete(eventType)
    // the socket drops the handler at once; should Home Assistant not confirm (connection lost), the subscription ends with the connection
    if (subscription.id !== undefined) void this.socket?.unsubscribe(subscription.id).catch(() => undefined)
  }

  private deliver(eventType: string, subscription: Subscription, event: unknown) {
    const parsed = BusEventSchema.safeParse(event)
    if (!parsed.success) return this.log.warn("Home Assistant sent an event in an unexpected shape", { eventType, problem: parsed.error.message })
    for (const listener of subscription.listeners) listener.event(parsed.data.data)
  }
}
