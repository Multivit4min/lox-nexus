import type { PluginLogger, PluginLogLevel } from "../plugin/PluginContext.ts"
import type { LogLevel } from "../wire/WorkerMessages.ts"

/**
 * The lowest log level the host keeps for this instance, so lines below it never cross to the
 * host. Everything passes until the host says otherwise: older hosts never do.
 */
export class LogLevels {
  /** what the worker tells the host in hello, so only it gets `log.level` */
  static readonly FEATURE = "log.level"
  private static readonly ORDER: readonly LogLevel[] = ["debug", "info", "warn", "error"]

  private current: LogLevel = "debug"
  private readonly listeners = new Set<(level: LogLevel) => void>()

  constructor(private readonly report: (error: unknown) => void) {}

  get level() {
    return this.current
  }

  /** whether a line at `level` is sent */
  keeps(level: LogLevel) {
    return LogLevels.ORDER.indexOf(level) >= LogLevels.ORDER.indexOf(this.current)
  }

  set(level: LogLevel) {
    if (level === this.current) return
    this.current = level
    for (const listener of [...this.listeners]) {
      try {
        listener(level)
      } catch (error) {
        this.report(error)
      }
    }
  }

  /** the plugin's `log`: one function per level, each dropping what the host doesn't keep */
  logger(log: (level: LogLevel, message: string, data?: unknown) => void): PluginLogger {
    return Object.fromEntries(LogLevels.ORDER.map(level => [level, (message: string, data?: unknown) => this.keeps(level) && log(level, message, data)])) as PluginLogger
  }

  /** the plugin's `logLevel` */
  view(): PluginLogLevel {
    const current = () => this.current
    return {
      get current() {
        return current()
      },
      onChange: listener => {
        this.listeners.add(listener)
        return () => {
          this.listeners.delete(listener)
        }
      }
    }
  }
}
