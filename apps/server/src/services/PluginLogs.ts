import type { Clock, PluginLogSink } from "@lox-nexus/core"
import type { PluginLogLevelDto, PluginLogLineDto } from "@lox-nexus/api"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { LogLevel } from "@lox-nexus/plugin-sdk/wire"
import type { Logger } from "pino"

/**
 * Plugin log lines into the server log, tagged with the instance's slug, and the last
 * `LINES_KEPT` of each instance in memory for the UI. Nothing of it survives a restart.
 *
 * Debug lines are kept only while the user switched debug logging on for the instance, for a few
 * minutes; otherwise a chatty plugin would push the lines that matter out of the ring. Workers
 * hear the level and don't even send what isn't kept.
 */
export class PluginLogs extends Disposable implements PluginLogSink {
  static readonly LINES_KEPT = 200
  /** while debug logging is on: room for the extra lines without losing the earlier ones at once */
  static readonly DEBUG_LINES_KEPT = 1000
  static readonly DEBUG_MINUTES = 15
  /** a chatty plugin must not fill the memory or the page that polls these lines */
  static readonly MESSAGE_CHARS = 2000
  static readonly DATA_CHARS = 2000
  private readonly recentLines = new Map<string, PluginLogLineDto[]>()
  private readonly debug = new Map<string, { until: number; cancel: () => void }>()
  private readonly listeners = new Map<string, Set<(level: LogLevel) => void>>()

  constructor(private readonly logger: Logger, private readonly clock: Clock) {
    super()
  }

  /** `level` maps straight onto the pino level of the same name */
  log(instance: { id: string; slug: string }, level: LogLevel, message: string, data?: unknown) {
    this.logger[level]({ plugin: instance.slug, ...(data === undefined ? {} : { data }) }, message)
    // older plugins send debug lines anyway
    if (level === "debug" && !this.debug.has(instance.id)) return
    const lines = this.recentLines.get(instance.id) ?? []
    lines.push({ ts: this.clock.now(), level, message: PluginLogs.cut(message, PluginLogs.MESSAGE_CHARS), ...(data === undefined ? {} : { data: PluginLogs.text(data) }) })
    if (lines.length > this.kept(instance.id)) lines.shift()
    this.recentLines.set(instance.id, lines)
  }

  /** the instance's last lines, oldest first */
  recent(instanceId: string): PluginLogLineDto[] {
    return [...(this.recentLines.get(instanceId) ?? [])]
  }

  /** the lowest level the instance's worker sends: debug also when the server log itself is at debug */
  level(instanceId: string): LogLevel {
    return this.debug.has(instanceId) || this.logger.isLevelEnabled("debug") ? "debug" : "info"
  }

  onLevel(instanceId: string, listener: (level: LogLevel) => void) {
    const listeners = this.listeners.get(instanceId) ?? new Set()
    listeners.add(listener)
    this.listeners.set(instanceId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && this.listeners.get(instanceId) === listeners) this.listeners.delete(instanceId)
    }
  }

  /** whether debug lines are kept for the instance, and until when */
  levelOf(instanceId: string): PluginLogLevelDto {
    const debug = this.debug.get(instanceId)
    return debug ? { level: "debug", until: debug.until, remainingMs: Math.max(0, debug.until - this.currentClock().now()) } : { level: "info" }
  }

  /** keeps debug lines for `minutes` (again from now when it is on already), or stops at once with "info" */
  setLevel(instanceId: string, level: "debug" | "info", minutes = PluginLogs.DEBUG_MINUTES): PluginLogLevelDto {
    const before = this.level(instanceId)
    this.debug.get(instanceId)?.cancel()
    this.debug.delete(instanceId)
    if (level === "debug") {
      // the timer's clock, so `until` is when it fires
      const ms = minutes * 60_000
      this.debug.set(instanceId, { until: this.currentClock().now() + ms, cancel: this.after(ms, () => this.setLevel(instanceId, "info")) })
    } else {
      this.trim(instanceId)
    }
    const after = this.level(instanceId)
    if (after !== before) this.announce(instanceId, after)
    return this.levelOf(instanceId)
  }

  /** drops a deleted instance's lines and level */
  forget(instanceId: string) {
    this.recentLines.delete(instanceId)
    this.debug.get(instanceId)?.cancel()
    this.debug.delete(instanceId)
  }

  // also runs from the timer, where a throw would end the server
  private announce(instanceId: string, level: LogLevel) {
    for (const listener of [...this.listeners.get(instanceId) ?? []]) {
      try {
        listener(level)
      } catch (error) {
        this.logger.error({ err: error, instanceId }, "passing on a plugin's log level failed")
      }
    }
  }

  private kept(instanceId: string) {
    return this.debug.has(instanceId) ? PluginLogs.DEBUG_LINES_KEPT : PluginLogs.LINES_KEPT
  }

  // back to the normal ring: the newest lines stay
  private trim(instanceId: string) {
    const lines = this.recentLines.get(instanceId)
    if (lines && lines.length > PluginLogs.LINES_KEPT) lines.splice(0, lines.length - PluginLogs.LINES_KEPT)
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
