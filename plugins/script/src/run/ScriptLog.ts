import type { PluginLogger, PluginLogLevel } from "@lox-nexus/plugin-sdk"

type Level = keyof PluginLogger

/**
 * Everything the script logs, with a budget: a script that logs from a fast interval (or fails in
 * one) would otherwise flood the server log. Lines beyond the budget are counted, and the count is
 * logged together with the first line of a later window (measured with the clock instead of a
 * timer, so nothing has to be cleaned up; a script that falls silent reports its count never).
 * Messages are built only when they fit the budget, so dropped lines cost no formatting.
 * `console.debug` lines count only while the instance keeps debug lines; otherwise they would use
 * up the budget for lines nobody sees.
 */
export class ScriptLog {
  static readonly LIMIT = 100
  static readonly WINDOW_MS = 10_000
  static readonly MAX_LENGTH = 10_000
  private windowStart = -Infinity
  private lines = 0
  private dropped = 0

  constructor(private readonly log: PluginLogger, private readonly now: () => number = Date.now, private readonly level?: Pick<PluginLogLevel, "current">) {}

  write(level: Level, message: string | (() => string), data?: { stack: string }) {
    if (level === "debug" && this.level && this.level.current !== "debug") return
    this.rollWindow()
    if (this.lines >= ScriptLog.LIMIT) {
      this.dropped++
      return
    }
    this.lines++
    const text = ScriptLog.clip(typeof message === "string" ? message : message())
    if (data === undefined) this.log[level](text)
    else this.log[level](text, { stack: ScriptLog.clip(data.stack) })
  }

  private rollWindow() {
    const now = this.now()
    if (now - this.windowStart < ScriptLog.WINDOW_MS) return
    if (this.dropped > 0) {
      this.log.warn(`${this.dropped} script log lines dropped: more than ${ScriptLog.LIMIT} in ${ScriptLog.WINDOW_MS / 1000} s`)
    }
    this.windowStart = now
    this.lines = 0
    this.dropped = 0
  }

  private static clip(text: string) {
    return text.length > ScriptLog.MAX_LENGTH ? `${text.slice(0, ScriptLog.MAX_LENGTH)}… (clipped)` : text
  }
}
