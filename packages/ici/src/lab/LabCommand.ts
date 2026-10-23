import type { Writable } from "node:stream"

export interface LabContext {
  out: Writable
  err: Writable
  /** aborted on Ctrl+C for interruptible commands */
  signal: AbortSignal
}

export interface LabCommand {
  readonly name: string
  readonly usage: string
  /** true if the command honours the abort signal; otherwise Ctrl+C exits immediately */
  readonly interruptible: boolean
  run(args: string[], context: LabContext): Promise<void>
}
