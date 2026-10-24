import type { Clock, PluginLogSink } from "@lox-nexus/core"
import type { PluginLogLineDto } from "@lox-nexus/api"
import type { LogLevel } from "@lox-nexus/plugin-sdk/wire"
import type { Logger } from "pino"

/**
 * Plugin log lines into the server log, tagged with the instance's slug, and the last
 * `LINES_KEPT` of each instance in memory for the UI. Nothing of it survives a restart.
 */
export class PluginLogs implements PluginLogSink {
  static readonly LINES_KEPT = 200
  /** a chatty plugin must not fill the memory or the page that polls these lines */
  static readonly MESSAGE_CHARS = 2000
  static readonly DATA_CHARS = 2000
  private readonly recentLines = new Map<string, PluginLogLineDto[]>()

  constructor(private readonly logger: Logger, private readonly clock: Clock) {}

  /** `level` maps straight onto the pino level of the same name */
  log(instance: { id: string; slug: string }, level: LogLevel, message: string, data?: unknown) {
    this.logger[level]({ plugin: instance.slug, ...(data === undefined ? {} : { data }) }, message)
    const lines = this.recentLines.get(instance.id) ?? []
    lines.push({ ts: this.clock.now(), level, message: PluginLogs.cut(message, PluginLogs.MESSAGE_CHARS), ...(data === undefined ? {} : { data: PluginLogs.text(data) }) })
    if (lines.length > PluginLogs.LINES_KEPT) lines.shift()
    this.recentLines.set(instance.id, lines)
  }

  /** the instance's last lines, oldest first */
  recent(instanceId: string): PluginLogLineDto[] {
    return [...(this.recentLines.get(instanceId) ?? [])]
  }

  /** drops a deleted instance's lines */
  forget(instanceId: string) {
    this.recentLines.delete(instanceId)
  }

  private static text(data: unknown) {
    let json: string
    try {
      json = JSON.stringify(data) ?? String(data)
    } catch {
      json = String(data)
    }
    return PluginLogs.cut(json, PluginLogs.DATA_CHARS)
  }

  private static cut(text: string, max: number) {
    return text.length > max ? `${text.slice(0, max)}…` : text
  }
}
