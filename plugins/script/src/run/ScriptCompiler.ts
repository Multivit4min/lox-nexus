import vm from "node:vm"
import { ScriptErrors } from "./ScriptErrors.ts"

/** A script that compiled, with the error reader that knows its length. */
export interface CompiledScript {
  script: vm.Script
  errors: ScriptErrors
}

/**
 * Compiles user code as the body of an async function, so top-level `await` works. The wrapper
 * opens on a line of its own and `lineOffset: -1` hides it, so line numbers in errors and stacks
 * are the user's. Running the script returns the function's promise.
 */
export class ScriptCompiler {
  private static readonly prefix = "(async () => {\n"
  private static readonly suffix = "\n})()"
  // the line terminators of ECMAScript, so line numbers match V8's
  private static readonly lineBreak = /\r\n|[\r\n\u2028\u2029]/

  /** @throws Error "syntax error at line 3, column 7: Unexpected token ')'" */
  compile(code: string): CompiledScript {
    const lines = code.split(ScriptCompiler.lineBreak)
    try {
      const script = new vm.Script(ScriptCompiler.prefix + code + ScriptCompiler.suffix, {
        filename: ScriptErrors.FILENAME,
        lineOffset: -1
      })
      return { script, errors: new ScriptErrors(lines.length) }
    } catch (error) {
      throw new Error(`syntax error ${ScriptCompiler.explain(error, lines)}`, { cause: error })
    }
  }

  /**
   * Reads line and column from the decorated stack Node gives compile errors:
   * "script.js:3\n<source line>\n      ^\n\nSyntaxError: …". An error on the wrapper's closing
   * line means the user's code left something open.
   */
  private static explain(error: unknown, lines: string[]) {
    const message = ScriptErrors.isErrorLike(error) ? error.message : String(error)
    const stack = ScriptErrors.isErrorLike(error) && typeof error.stack === "string" ? error.stack : ""
    const match = /^script\.js:(\d+)\n.*\n([ \t]*)\^/.exec(stack)
    if (!match) return `in the script: ${message}`
    const line = Number(match[1])
    if (line > lines.length) {
      const last = lines.length
      return `at line ${last}, column ${(lines[last - 1] ?? "").length + 1}: unexpected end of the script (${message}); a bracket, brace, string or comment is not closed`
    }
    return `at line ${line}, column ${(match[2] ?? "").length + 1}: ${message}`
  }
}
