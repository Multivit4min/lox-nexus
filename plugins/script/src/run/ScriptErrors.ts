/** A position in the script as the user wrote it, 1-based. */
export interface ScriptLocation {
  line: number
  column: number
}

interface ErrorLike {
  name?: unknown
  message: string
  stack?: unknown
  cause?: unknown
}

/**
 * Reads errors thrown by script code. They usually come from the script's own realm, so
 * `instanceof Error` is false and the shape is checked instead. Only frames inside the user's
 * lines count: host frames (the plugin, node:vm) and the wrapper's own last line are noise.
 */
export class ScriptErrors {
  static readonly FILENAME = "script.js"
  private static readonly frame = /[\s(]script\.js:(\d+):(\d+)\)?$/

  /** @param lines the number of lines of the user's code */
  constructor(private readonly lines: number) {}

  /** "line 4, column 11: TypeError: boom", or the bare message when no script frame is known */
  describe(error: unknown): string {
    const where = this.where(error)
    const text = ScriptErrors.message(error)
    return where ? `line ${where.line}, column ${where.column}: ${text}` : text
  }

  /** the innermost frame of the script itself */
  where(error: unknown): ScriptLocation | undefined {
    for (const line of ScriptErrors.stackLines(error)) {
      const location = this.locate(line)
      if (location) return location
    }
    return undefined
  }

  /**
   * The message followed by the script's own frames, without host frames, and the cause's message
   * if there is one (fetch puts the network error there).
   */
  stack(error: unknown): string {
    const frames = ScriptErrors.stackLines(error).filter(line => this.locate(line) !== undefined)
    const lines = [ScriptErrors.message(error), ...frames.map(frame => `    ${frame.trim()}`)]
    const cause = ScriptErrors.isErrorLike(error) ? error.cause : undefined
    if (ScriptErrors.isErrorLike(cause)) lines.push(`  caused by ${ScriptErrors.message(cause)}`)
    return lines.join("\n")
  }

  /** "TypeError: boom" for errors, the text itself for anything else that was thrown */
  static message(error: unknown): string {
    if (!ScriptErrors.isErrorLike(error)) return ScriptErrors.text(error)
    const name = typeof error.name === "string" ? error.name : ""
    return name && name !== "Error" ? `${name}: ${error.message}` : error.message
  }

  static isErrorLike(error: unknown): error is ErrorLike {
    return typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
  }

  private locate(frame: string): ScriptLocation | undefined {
    const match = ScriptErrors.frame.exec(frame.trimEnd())
    if (!match) return undefined
    const line = Number(match[1])
    return line >= 1 && line <= this.lines ? { line, column: Number(match[2]) } : undefined
  }

  private static stackLines(error: unknown): string[] {
    if (!ScriptErrors.isErrorLike(error) || typeof error.stack !== "string") return []
    return error.stack.split("\n").slice(1)
  }

  private static text(value: unknown) {
    try {
      return String(value)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }
}
