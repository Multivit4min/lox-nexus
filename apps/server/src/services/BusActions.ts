import type { EventBus } from "@lox-nexus/core"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import { HttpError } from "../http/HttpError.ts"

/**
 * What people and agents do on the bus by hand: pin a value (force), let go of it (release), and
 * publish one value (inject). The Bus Inspector and the MCP operate tools both go through here,
 * so a force carries who set it either way.
 */
export class BusActions {
  constructor(private readonly bus: Pick<EventBus, "force" | "release" | "publish" | "command" | "activeForces">) {}

  /** @throws HttpError 400 for an invalid topic or an `until` in the past */
  force(topic: string, value: Value, options: { by: string; reason?: string | undefined; until?: number | undefined }) {
    const { by, reason, until } = options
    BusActions.guard(() => this.bus.force(topic, value, { by, ...(reason ? { reason } : {}), ...(until ? { until } : {}) }))
  }

  /** @throws HttpError 404 when the topic has no force */
  release(topic: string, by: string) {
    if (!this.bus.activeForces().some(force => force.topic === topic)) throw HttpError.notFound(`force on "${topic}"`)
    this.bus.release(topic, by)
  }

  /**
   * one value, flagged as injected: a state as if the signal had it, or a command an actuator acts on
   * @throws HttpError 400 for an invalid topic
   */
  inject(topic: string, value: Value, kind: "state" | "command", by: string) {
    const options = { source: { kind: "user" as const, id: by }, flags: { injected: true as const } }
    BusActions.guard(() => (kind === "command" ? this.bus.command(topic, value, options) : this.bus.publish(topic, value, options)))
  }

  // invalid topics, patterns and expiries throw RangeError in the bus: those are bad requests (400), anything else stays a 500
  static guard<T>(work: () => T): T {
    try {
      return work()
    } catch (error) {
      if (error instanceof RangeError) throw HttpError.badRequest(error.message)
      throw error
    }
  }
}
