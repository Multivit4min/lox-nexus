import type { AddressInfo } from "node:net"
import { WebSocketServer, type WebSocket } from "ws"

type Entity = { s: string; a: Record<string, unknown>; lc?: number }
type ServiceCall = { domain: string; service: string; service_data: Record<string, unknown>; target?: { entity_id: string } }
type Registries = { areas: unknown[]; devices: unknown[]; entities: unknown[] }

/**
 * A Home Assistant WebSocket API on 127.0.0.1 for tests: the auth handshake, subscribe_entities
 * with change and remove events, subscribe_events and unsubscribe_events with fired events,
 * call_service (recorded), ping and the registry lists.
 */
export class FakeHomeAssistant {
  static readonly TOKEN = "good-token"
  /** the token it accepts; change it to revoke the plugin's */
  token = FakeHomeAssistant.TOKEN
  /** replaces the full list a new subscription starts with, e.g. with a malformed event */
  firstEvent: object | undefined
  readonly calls: ServiceCall[] = []
  readonly entities = new Map<string, Entity>()
  registries: Registries = { areas: [], devices: [], entities: [] }
  /** the next call_service answers with this error instead of success */
  failNext: { code: string; message: string } | undefined
  /** stop answering pings, as a dead connection would */
  silent = false
  authAttempts = 0
  /** event types whose subscription is refused, as for a token of a user who isn't an admin */
  readonly refusedEvents = new Set<string>()
  /** the event types of every unsubscribe_events, in order */
  readonly unsubscribed: string[] = []
  /** the event types of every subscribe_events received, in order, answered or not */
  readonly subscribeRequests: string[] = []
  /** event types whose next subscribe_events goes unanswered (once each), as from a stuck server */
  readonly unanswered = new Set<string>()
  private readonly subscribers = new Map<WebSocket, number>()
  /** per connection: subscription id → event type */
  private readonly eventSubscribers = new Map<WebSocket, Map<number, string>>()

  private constructor(private readonly server: WebSocketServer) {
    server.on("connection", socket => this.accept(socket))
  }

  static async start() {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 })
    await new Promise(resolve => server.once("listening", resolve))
    return new FakeHomeAssistant(server)
  }

  get url() {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  get clients() {
    return this.server.clients.size
  }

  /** sets (or adds) an entity and tells subscribers, as a state change in Home Assistant would */
  set(entityId: string, state: string, attributes: Record<string, unknown> = {}) {
    const known = this.entities.has(entityId)
    this.entities.set(entityId, { s: state, a: attributes, lc: 1_800_000_000 })
    this.broadcast(known ? { c: { [entityId]: { "+": { s: state, a: attributes } } } } : { a: { [entityId]: this.entities.get(entityId) } })
  }

  /** the open subscribe_events subscriptions to an event type, over all connections */
  subscriptions(eventType: string) {
    return [...this.eventSubscribers.values()].flatMap(types => [...types.values()]).filter(type => type === eventType).length
  }

  /** fires an event, as an integration in Home Assistant would */
  fire(eventType: string, data: Record<string, unknown>) {
    const event = { event_type: eventType, data, origin: "LOCAL", time_fired: "2026-10-28T07:30:00.000000+00:00", context: { id: "01J0000000000000000000000" } }
    for (const [socket, types] of this.eventSubscribers) {
      for (const [id, type] of types) if (type === eventType) socket.send(JSON.stringify({ id, type: "event", event }))
    }
  }

  remove(entityId: string) {
    this.entities.delete(entityId)
    this.broadcast({ r: [entityId] })
  }

  /** drops every connection without a close handshake */
  dropConnections() {
    for (const client of this.server.clients) client.terminate()
  }

  async close() {
    this.dropConnections()
    await new Promise(resolve => this.server.close(resolve))
  }

  private accept(socket: WebSocket) {
    socket.send(JSON.stringify({ type: "auth_required", ha_version: "2026.10.2" }))
    socket.on("message", data => this.receive(socket, JSON.parse(String(data)) as Record<string, unknown>))
    socket.on("close", () => {
      this.subscribers.delete(socket)
      this.eventSubscribers.delete(socket)
    })
  }

  private receive(socket: WebSocket, message: Record<string, unknown>) {
    const id = message.id as number
    const reply = (fields: object) => socket.send(JSON.stringify({ id, ...fields }))
    switch (message.type) {
      case "auth": return this.auth(socket, message.access_token)
      case "ping": return this.silent ? undefined : reply({ type: "pong" })
      case "subscribe_entities":
        this.subscribers.set(socket, id)
        reply({ type: "result", success: true, result: null })
        return socket.send(JSON.stringify({ id, type: "event", event: this.firstEvent ?? { a: Object.fromEntries(this.entities) } }))
      case "subscribe_events": return this.subscribeEvents(socket, id, message.event_type, reply)
      case "unsubscribe_events": return this.unsubscribeEvents(socket, message.subscription, reply)
      case "call_service": return this.callService(message as unknown as ServiceCall, reply)
      case "config/area_registry/list": return reply({ type: "result", success: true, result: this.registries.areas })
      case "config/device_registry/list": return reply({ type: "result", success: true, result: this.registries.devices })
      case "config/entity_registry/list": return reply({ type: "result", success: true, result: this.registries.entities })
      default: return reply({ type: "result", success: false, error: { code: "unknown_command", message: "Unknown command." } })
    }
  }

  private auth(socket: WebSocket, token: unknown) {
    this.authAttempts++
    if (token === this.token) return socket.send(JSON.stringify({ type: "auth_ok", ha_version: "2026.10.2" }))
    socket.send(JSON.stringify({ type: "auth_invalid", message: "Invalid access token or password" }))
    socket.close()
  }

  private subscribeEvents(socket: WebSocket, id: number, eventType: unknown, reply: (fields: object) => void) {
    if (typeof eventType !== "string") return reply({ type: "result", success: false, error: { code: "invalid_format", message: "event_type must be a string" } })
    this.subscribeRequests.push(eventType)
    if (this.unanswered.delete(eventType)) return
    if (this.refusedEvents.has(eventType)) return reply({ type: "result", success: false, error: { code: "unauthorized", message: "Unauthorized" } })
    const types = this.eventSubscribers.get(socket) ?? new Map<number, string>()
    this.eventSubscribers.set(socket, types.set(id, eventType))
    reply({ type: "result", success: true, result: null })
  }

  private unsubscribeEvents(socket: WebSocket, subscription: unknown, reply: (fields: object) => void) {
    const types = this.eventSubscribers.get(socket)
    const eventType = typeof subscription === "number" ? types?.get(subscription) : undefined
    if (typeof subscription !== "number" || eventType === undefined) {
      return reply({ type: "result", success: false, error: { code: "not_found", message: "Subscription not found." } })
    }
    types?.delete(subscription)
    this.unsubscribed.push(eventType)
    reply({ type: "result", success: true, result: null })
  }

  private callService({ domain, service, service_data, target }: ServiceCall, reply: (fields: object) => void) {
    this.calls.push({ domain, service, service_data, ...(target ? { target } : {}) })
    const error = this.failNext
    this.failNext = undefined
    reply(error ? { type: "result", success: false, error } : { type: "result", success: true, result: { context: {} } })
  }

  /** sends a subscribe_entities event to every subscriber */
  broadcast(event: object) {
    for (const [socket, id] of this.subscribers) socket.send(JSON.stringify({ id, type: "event", event }))
  }
}
