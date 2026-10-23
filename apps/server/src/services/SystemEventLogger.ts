import type { BusMessage, EventBus } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"

/**
 * Mirrors system/# events (bus and wire errors, Miniserver problems) into the process log, so
 * they are visible without the inspector, e.g. in `docker logs`.
 */
export class SystemEventLogger extends Disposable {
  constructor(bus: Pick<EventBus, "subscribe">, private readonly log: Logger) {
    super()
    this.own(bus.subscribe("system/#", message => this.write(message)))
  }

  private write(message: BusMessage) {
    if (message.kind === "event") return this.log.warn({ topic: message.topic, source: message.source.id }, message.text ?? "")
    if (message.topic.endsWith("/status") && message.value?.type === "string") {
      this.log.info({ topic: message.topic }, `status: ${message.value.value}`)
    }
  }
}
