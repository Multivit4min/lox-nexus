import type { BusMessageDto } from "@lox-nexus/api"

/** Small text helpers for rendering bus messages, matching core's MessageFormatter symbols. */
export class MessageText {
  private static readonly KIND_SYMBOLS: Record<BusMessageDto["kind"], string> = {
    state: "", command: "▶", result: "✓", force: "🔒", release: "🔓", event: "•"
  }

  /** HH:MM:SS.mmm in local time */
  static time(ts: number) {
    const date = new Date(ts)
    const pad = (n: number, width = 2) => String(n).padStart(width, "0")
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  }

  static symbol(message: BusMessageDto) {
    if (message.kind === "result" && message.outcome && !message.outcome.ok) return "✗"
    return MessageText.KIND_SYMBOLS[message.kind]
  }

  /** "Loxone haus", "wire Küche → Licht", "user admin" */
  static source(message: BusMessageDto) {
    const { kind, id, label } = message.source
    return `${kind} ${label ?? id}`
  }

  /** what to show instead of a value for messages without one */
  static detail(message: BusMessageDto) {
    if (message.kind === "result" && message.outcome) {
      return message.outcome.ok ? `${message.outcome.durationMs} ms` : `${message.outcome.error ?? "failed"} (${message.outcome.durationMs} ms)`
    }
    if (message.kind === "force" && message.force) return `by ${message.force.by}${message.force.reason ? `: ${message.force.reason}` : ""}`
    return message.text ?? ""
  }

  static flags(message: BusMessageDto): string[] {
    return Object.keys(message.flags ?? {})
  }
}
