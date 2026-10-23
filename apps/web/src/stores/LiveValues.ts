import type { BusMessageDto, StreamEvent } from "@lox-nexus/api"
import { shallowReactive } from "vue"
import type { StreamConnection, StreamHandlers, StreamState } from "../api/StreamConnection.ts"

/**
 * The current message per topic for a pattern, kept live over the stream's `state` subscription.
 * One instance per view; close() when the view unmounts. A topic that loses its value (a force
 * released before any real value arrived) is removed, so a stale forced value doesn't linger.
 */
export class LiveValues {
  readonly values = shallowReactive(new Map<string, BusMessageDto>())
  readonly status = shallowReactive({ state: "connecting" as StreamState })
  private readonly connection: StreamConnection

  /** @param connect usually AppContext.stream */
  constructor(connect: (handlers: StreamHandlers) => StreamConnection, pattern: string) {
    this.connection = connect({ onEvent: event => this.apply(event), onState: state => (this.status.state = state) })
    this.connection.subscribe("state", pattern)
    this.connection.open()
  }

  get(topic: string) {
    return this.values.get(topic)
  }

  /** follow another pattern, e.g. after the Miniserver's slug changed */
  watch(pattern: string) {
    this.values.clear()
    this.connection.subscribe("state", pattern)
  }

  close() {
    this.connection.close()
  }

  private apply(event: StreamEvent) {
    if (event.type !== "state") return
    if (event.full) this.values.clear()
    for (const message of event.messages) this.values.set(message.topic, message)
    for (const topic of event.cleared ?? []) this.values.delete(topic)
  }
}
