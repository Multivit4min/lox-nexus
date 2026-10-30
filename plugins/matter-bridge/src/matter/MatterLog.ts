import type { PluginLogger, PluginLogLevel } from "@lox-nexus/plugin-sdk"
import { LogDestination, Logger, LogLevel, type Diagnostic } from "@matter/main"

/**
 * Routes matter.js's logging into the instance log instead of stdout. matter.js is chatty: its
 * debug lines are dropped, info lines become debug, notices info, warnings and errors stay what
 * they are. Its info lines are only produced while the instance keeps debug lines, so matter.js
 * doesn't format what would be dropped. The ASCII-art QR code is never logged (see
 * `QuietCommissioningServer`).
 */
export class MatterLog {
  /** the destinations installed now; matter.js's console destination is back once none is left */
  private static readonly installed = new Set<string>()
  private static console: LogDestination | undefined
  private static counter = 0

  private readonly name = `lox-nexus-${++MatterLog.counter}`

  constructor(private readonly log: PluginLogger, private readonly level: PluginLogLevel) {}

  /** starts routing; returns the teardown that stops it */
  install() {
    const destinations = Logger.destinations
    if (MatterLog.installed.size === 0 && "default" in destinations) {
      MatterLog.console = destinations.default
      delete destinations.default
    }
    const destination = destinations[this.name] = LogDestination({
      name: this.name,
      level: MatterLog.levelFor(this.level.current),
      write: (text: string, message: Diagnostic.Message) => this.write(text, message.level)
    })
    MatterLog.installed.add(this.name)
    const unsubscribe = this.level.onChange(level => (destination.level = MatterLog.levelFor(level)))
    return () => {
      unsubscribe()
      this.uninstall()
    }
  }

  /** matter.js's info lines become our debug lines, so they are only worth producing while those are kept */
  static levelFor(level: PluginLogLevel["current"]) {
    return level === "debug" ? LogLevel.INFO : LogLevel.NOTICE
  }

  private uninstall() {
    if (!MatterLog.installed.delete(this.name)) return
    delete Logger.destinations[this.name]
    if (MatterLog.installed.size === 0 && MatterLog.console) Logger.destinations.default = MatterLog.console
  }

  private write(text: string, level: LogLevel) {
    // the instance log has its own time and level
    const message = `matter.js: ${text.replace(/^\S+ \S+ [A-Z]+ /, "")}`
    if (level >= LogLevel.ERROR) this.log.error(message)
    else if (level === LogLevel.WARN) this.log.warn(message)
    else if (level === LogLevel.NOTICE) this.log.info(message)
    else this.log.debug(message)
  }
}
