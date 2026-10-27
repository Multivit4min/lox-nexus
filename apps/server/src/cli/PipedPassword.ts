import type { PasswordSource } from "./ResetPasswordCommand.ts"

/**
 * Reads the password from piped input (`… | npm run reset-password`, ssh without a terminal):
 * the first line, without its \r\n. Decoded as one UTF-8 stream, so a character split across
 * reads stays intact, and capped, since a password is never longer than a few hundred bytes.
 */
export class PipedPassword implements PasswordSource {
  static readonly MAX_CHARS = 1024
  readonly interactive = false

  constructor(private readonly input: NodeJS.ReadableStream, private readonly output: Pick<NodeJS.WriteStream, "write">) {}

  /** @throws Error for a first line longer than MAX_CHARS */
  async read(): Promise<string> {
    this.output.write("Reading the new password from standard input…\n")
    this.input.setEncoding("utf8")
    let text = ""
    for await (const chunk of this.input) {
      const end = String(chunk).indexOf("\n")
      text += end === -1 ? String(chunk) : String(chunk).slice(0, end)
      if (end !== -1) break
      if (text.length > PipedPassword.MAX_CHARS) throw new Error(`no line break within ${PipedPassword.MAX_CHARS} characters`)
    }
    if (text.length > PipedPassword.MAX_CHARS) throw new Error(`no line break within ${PipedPassword.MAX_CHARS} characters`)
    return text.replace(/\r$/, "")
  }
}
