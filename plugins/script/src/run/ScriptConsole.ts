import type { ScriptErrors } from "./ScriptErrors.ts"
import type { ScriptLog } from "./ScriptLog.ts"

/** the console methods a script has, and the plugin log level each one writes at */
const levels = { log: "info", info: "info", debug: "debug", warn: "warn", error: "error" } as const

type ConsoleMethod = keyof typeof levels

/**
 * The script's `console`: each call becomes one line of the plugin's log at the matching level.
 * Arguments are joined with spaces; strings as they are, objects as JSON, errors with the
 * script's part of their stack. Formatting waits until the log budget has room for the line.
 */
export class ScriptConsole {
  constructor(private readonly log: ScriptLog, private readonly errors: () => ScriptErrors) {}

  build(): Record<ConsoleMethod, (...args: unknown[]) => void> {
    const methods = Object.keys(levels) as ConsoleMethod[]
    return Object.freeze(Object.fromEntries(methods.map(method =>
      [method, (...args: unknown[]) => this.log.write(levels[method], () => this.format(args))]))) as Record<ConsoleMethod, (...args: unknown[]) => void>
  }

  format(args: unknown[]): string {
    return args.map(arg => this.formatOne(arg)).join(" ")
  }

  private formatOne(arg: unknown): string {
    switch (typeof arg) {
      case "string": return arg
      case "function": return `[function ${arg.name || "anonymous"}]`
      case "bigint": return `${arg}n`
      case "object": return arg === null ? "null" : this.formatObject(arg)
      default: return String(arg)
    }
  }

  private formatObject(arg: object): string {
    if (typeof (arg as { stack?: unknown }).stack === "string" && typeof (arg as { message?: unknown }).message === "string") {
      return this.errors().stack(arg)
    }
    try {
      return JSON.stringify(arg, null, 2) ?? Object.prototype.toString.call(arg)
    } catch {
      return `${Object.prototype.toString.call(arg)} (not serialisable as JSON)`
    }
  }
}
