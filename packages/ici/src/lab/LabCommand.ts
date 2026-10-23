import type { Writable } from "node:stream"

/** What a command may touch. Streams are injected so tests can capture the output. */
export interface LabContext {
  out: Writable
  err: Writable
  /** aborted on Ctrl+C for interruptible commands */
  signal: AbortSignal
}

/** One sub-command of ici-lab. */
export interface LabCommand {
  /** first command line argument that selects it */
  readonly name: string
  /** one-line synopsis shown in help */
  readonly usage: string
  /** true if the command honours the abort signal; otherwise Ctrl+C exits immediately */
  readonly interruptible: boolean
  /** @param args the arguments after the command name. @throws Error with a user-readable message for bad input */
  run(args: string[], context: LabContext): Promise<void>
}
