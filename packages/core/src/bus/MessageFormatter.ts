import { ValueFormatter } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "./BusMessage.ts"

/** Options of MessageFormatter. */
export interface FormatOptions {
  /** render times in UTC instead of local time (useful for tests and logs) */
  utc?: boolean
  /** padding of the topic column in characters (default 40); longer topics are not truncated */
  topicWidth?: number
}

/**
 * One readable line per message, shared by the inspector, logs and the CLI:
 * "12:04:31.121  homeassistant/zuhause/actuator/kitchen-light  ▶ 42  ← wire Küche Dimmer → Licht"
 */
export class MessageFormatter {
  private readonly values = new ValueFormatter()

  constructor(private readonly options: FormatOptions = {}) {}

  /** Lossy and meant for people: do not parse the line. */
  format(message: BusMessage): string {
    const topic = message.topic.padEnd(this.options.topicWidth ?? 40)
    return `${this.time(message.ts)}  ${topic}  ${this.body(message)}  ← ${this.source(message)}`
  }

  private body(message: BusMessage): string {
    const value = this.values.format(message.value)
    switch (message.kind) {
      case "state": return this.withFlags(value, message)
      case "command": return this.withFlags(`▶ ${value}`, message)
      case "result": return message.outcome?.ok
        ? `✓ ${message.outcome.durationMs} ms`
        : `✗ ${message.outcome?.error ?? "failed"} (${message.outcome?.durationMs ?? 0} ms)`
      case "force": return `🔒 force ${value} (by ${message.force?.by}${message.force?.reason ? `: "${message.force.reason}"` : ""})`
      case "release": return `🔓 released${message.text ? ` (${message.text})` : ""}`
      case "event": return message.text ?? ""
    }
  }

  private withFlags(body: string, message: BusMessage) {
    const flags = message.flags
    if (flags?.shadowed) return `(shadowed) ${body}`
    const prefix = flags?.forced ? "🔒 " : ""
    const suffix = [flags?.restored && "restored", flags?.injected && "injected"].filter(Boolean)
    return `${prefix}${body}${suffix.length ? ` (${suffix.join(", ")})` : ""}`
  }

  private source(message: BusMessage) {
    const { kind, id, label } = message.source
    return label ? `${kind} ${label}` : `${kind} ${id}`
  }

  private time(ts: number) {
    const date = new Date(ts)
    const utc = this.options.utc ?? false
    const parts = utc
      ? [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
      : [date.getHours(), date.getMinutes(), date.getSeconds()]
    const ms = utc ? date.getUTCMilliseconds() : date.getMilliseconds()
    return `${parts.map(part => String(part).padStart(2, "0")).join(":")}.${String(ms).padStart(3, "0")}`
  }
}
