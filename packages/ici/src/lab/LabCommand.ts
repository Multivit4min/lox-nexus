import type { Writable } from "node:stream"

export interface LabContext {
  out: Writable
  /** aborted on Ctrl+C */
  signal: AbortSignal
}

export interface LabCommand {
  readonly name: string
  readonly usage: string
  run(args: string[], context: LabContext): Promise<void>
}
