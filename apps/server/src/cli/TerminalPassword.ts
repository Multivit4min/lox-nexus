import type { PasswordSource } from "./ResetPasswordCommand.ts"
import { LineEditor } from "./LineEditor.ts"

/** The parts of a TTY ReadStream a hidden prompt needs. */
export type TerminalInput = Pick<NodeJS.ReadStream, "setRawMode" | "setEncoding" | "resume" | "pause" | "on" | "off">

/** Signals that end the process while it prompts; the terminal must be restored first. */
const ENDING = { SIGTERM: 143, SIGHUP: 129 } as const

/**
 * Reads a password at a terminal without echoing it (raw mode, see LineEditor). Raw mode is
 * switched off on every way out: Enter, Ctrl-C, the input ending, and SIGTERM/SIGHUP.
 */
export class TerminalPassword implements PasswordSource {
  readonly interactive = true
  private readonly editor = new LineEditor()

  constructor(
    private readonly input: TerminalInput,
    private readonly output: Pick<NodeJS.WriteStream, "write">,
    private readonly process: Pick<NodeJS.Process, "once" | "off" | "exit">
  ) {}

  /** @throws Error when cancelled or when the input ends */
  read(prompt: string): Promise<string> {
    this.output.write(prompt)
    return new Promise((resolve, reject) => {
      const settle = (line: string | null | undefined) => {
        if (line === undefined) return
        stop()
        if (line === null) reject(new Error("cancelled"))
        else resolve(line)
      }
      const onData = (chunk: string) => {
        this.editor.feed(chunk)
        settle(this.editor.take())
      }
      const onEnd = () => {
        stop()
        reject(new Error("the input ended before Enter"))
      }
      const onSignal = (signal: keyof typeof ENDING) => {
        stop()
        this.process.exit(ENDING[signal])
      }
      const stop = () => {
        this.input.off("data", onData).off("end", onEnd).off("error", onEnd)
        for (const signal of Object.keys(ENDING)) this.process.off(signal, onSignal)
        this.input.setRawMode(false)
        this.input.pause()
        this.output.write("\n")
      }
      this.input.setEncoding("utf8")
      this.input.setRawMode(true)
      this.input.on("data", onData).on("end", onEnd).on("error", onEnd)
      for (const signal of Object.keys(ENDING) as Array<keyof typeof ENDING>) this.process.once(signal, onSignal)
      this.input.resume()
      // a line pasted together with the previous one is already there
      settle(this.editor.take())
    })
  }
}
