import { Disposable } from "@lox-nexus/plugin-sdk"
import type { IClientPublishOptions, MqttClient } from "mqtt"

/** what a session tells its connection */
export interface SessionListener {
  connected(): void
  message(topic: string, payload: Buffer, retained: boolean): void
  failed(error: Error): void
  closed(): void
}

/**
 * One MQTT.js client, from connecting until its connection closes; it never reconnects itself.
 * A new session per attempt keeps no stale state: closing one fails every unanswered publish
 * (MQTT.js would otherwise keep them for a later connection, unbounded).
 */
export class BrokerSession extends Disposable {
  private ended = false

  constructor(private readonly client: MqttClient, listener: SessionListener) {
    super()
    // destroy() runs after the listeners below are removed; its quiet() adds a no-op "error"
    // listener first, since an "error" without any listener would throw
    this.onDispose(() => this.destroy())
    this.listen(client, "connect", () => listener.connected())
    this.listen(client, "message", (topic: string, payload: Buffer, packet: { retain: boolean }) => listener.message(topic, payload, packet.retain))
    this.listen(client, "error", (error: Error) => listener.failed(error))
    this.listen(client, "close", () => listener.closed())
  }

  get connected() {
    return !this.ended && this.client.connected
  }

  publish(topic: string, payload: string, options: IClientPublishOptions) {
    return new Promise<void>((resolve, reject) => {
      this.client.publish(topic, payload, options, error => (error ? reject(error) : resolve()))
    })
  }

  /** subscribes; resolves with the filters the broker refused */
  subscribe(filters: string[]) {
    return new Promise<string[]>((resolve, reject) => {
      // a refusal comes as an error with the SUBACK, whose codes are in the order of the filters
      this.client.subscribe(filters, { qos: 1 }, (error, _granted, packet) => {
        const codes = packet && "granted" in packet ? packet.granted : undefined
        if (codes) resolve(filters.filter((_, index) => (Number(codes[index] ?? 0) & 0x80) !== 0))
        else if (error) reject(error)
        else resolve([])
      })
    })
  }

  unsubscribe(filters: string[]) {
    return new Promise<void>((resolve, reject) => {
      this.client.unsubscribe(filters, error => (error ? reject(error) : resolve()))
    })
  }

  /**
   * Ends the client gracefully: waits for unanswered publishes and sends DISCONNECT, so the broker
   * drops the last will instead of sending it. Can wait for the broker; destroy() cuts it short.
   */
  end() {
    if (this.ended) return Promise.resolve()
    this.quiet()
    return new Promise<void>(resolve => this.client.end(false, {}, () => resolve()))
  }

  /** closes the socket now; also cuts short an end() that waits for the broker */
  destroy() {
    if (!this.ended) {
      this.quiet()
      this.client.end(true)
    }
    // MQTT.js ignores a second end() while one is running
    this.client.stream?.destroy()
  }

  private quiet() {
    this.ended = true
    this.client.on("error", () => {})
  }
}
