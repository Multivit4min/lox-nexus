import http from "node:http"
import net from "node:net"
import type { AddressInfo } from "node:net"
import { Aedes, type AedesPublishPacket } from "aedes"
import { createWebSocketStream, WebSocketServer } from "ws"

/** a message published on the broker (by a client, a last will or publish()) */
export interface Published {
  topic: string
  payload: string
  retain: boolean
  qos: number
  /** undefined for the broker's own */
  clientId: string | undefined
}

export interface TestBrokerOptions {
  /** when set, only this user and password may connect */
  credentials?: { username: string; password: string }
  /** subscriptions to these filters are refused (SUBACK 128), like an ACL would */
  deny?: string[]
  /** MQTT over WebSocket at ws://127.0.0.1:<port>/mqtt instead of plain TCP */
  websocket?: boolean
  /** keep the port of a broker that ran before (a restart) */
  port?: number
}

/**
 * An in-process MQTT broker (aedes) on 127.0.0.1, for tests. Records what clients publish and
 * subscribe to; `restart()` closes it and opens a new one on the same port, retained messages lost,
 * like a broker without persistence.
 */
export class TestBroker {
  readonly published: Published[] = []
  readonly subscribed: string[] = []
  readonly unsubscribed: string[] = []
  private readonly sockets = new Set<net.Socket>()
  private closed = false
  /** fixed at start, so a restart can reuse it */
  port = 0

  private constructor(private readonly aedes: Aedes, private readonly server: net.Server, private readonly options: TestBrokerOptions) {
    if (!options.websocket) return
    const sockets = new WebSocketServer({ server: server as http.Server, path: "/mqtt" })
    sockets.on("connection", socket => aedes.handle(createWebSocketStream(socket)))
  }

  static async start(options: TestBrokerOptions = {}) {
    const aedes = await Aedes.createBroker({
      authenticate: TestBroker.authenticator(options.credentials),
      authorizeSubscribe: (_client, subscription, callback) => callback(null, options.deny?.includes(subscription.topic) ? null : subscription)
    })
    const server = options.websocket ? http.createServer() : net.createServer(aedes.handle)
    const broker = new TestBroker(aedes, server, options)
    broker.track()
    await new Promise<void>(resolve => server.listen(options.port ?? 0, "127.0.0.1", resolve))
    broker.port = (server.address() as AddressInfo).port
    return broker
  }

  get url() {
    return this.options.websocket ? `ws://127.0.0.1:${this.port}/mqtt` : `mqtt://127.0.0.1:${this.port}`
  }

  get clients() {
    return this.aedes.connectedClients
  }

  /** publishes as the broker itself, e.g. a device's retained state */
  publish(topic: string, payload: string | Buffer, retain = false) {
    return new Promise<void>((resolve, reject) => {
      this.aedes.publish({ cmd: "publish", topic, payload: Buffer.from(payload), retain, qos: 0, dup: false }, error => (error ? reject(error) : resolve()))
    })
  }

  /** messages published to a topic by clients */
  on(topic: string) {
    return this.published.filter(message => message.topic === topic)
  }

  /** cuts every client off without a DISCONNECT, as a crash or a lost network would */
  dropClients() {
    for (const socket of this.sockets) socket.destroy()
  }

  async close() {
    if (this.closed) return
    this.closed = true
    for (const socket of this.sockets) socket.destroy()
    await new Promise<void>(resolve => this.server.close(() => resolve()))
    await new Promise<void>(resolve => this.aedes.close(() => resolve()))
  }

  /** closes (unless closed already) and starts a fresh broker on the same port */
  async restart() {
    await this.close()
    return TestBroker.start({ ...this.options, port: this.port })
  }

  private track() {
    this.server.on("connection", socket => {
      this.sockets.add(socket)
      socket.on("close", () => this.sockets.delete(socket))
    })
    this.aedes.on("publish", (packet: AedesPublishPacket, client) => {
      // the broker's own messages too (last wills, publish()), but not its $SYS heartbeats
      if (packet.topic.startsWith("$SYS")) return
      this.published.push({ topic: packet.topic, payload: packet.payload.toString(), retain: packet.retain, qos: packet.qos, clientId: client?.id })
    })
    this.aedes.on("subscribe", subscriptions => this.subscribed.push(...subscriptions.map(subscription => subscription.topic)))
    this.aedes.on("unsubscribe", topics => this.unsubscribed.push(...topics))
  }

  private static authenticator(credentials: TestBrokerOptions["credentials"]) {
    return (_client: unknown, username: string | undefined, password: Buffer | undefined, done: (error: (Error & { returnCode: number }) | null, success: boolean | null) => void) => {
      if (!credentials || (username === credentials.username && password?.toString() === credentials.password)) return done(null, true)
      done(Object.assign(new Error("bad credentials"), { returnCode: 4 }), false)
    }
  }
}
