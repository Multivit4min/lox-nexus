import { createWriteStream, type WriteStream } from "node:fs"
import type { RemoteInfo } from "node:dgram"

/** Appends received datagrams as JSONL ({ t, from, hex }), the format used by test fixtures. */
export class CaptureLog {
  private readonly stream: WriteStream

  /** Appends to an existing file, so several capture sessions can share one fixture file. */
  constructor(file: string) {
    this.stream = createWriteStream(file, { flags: "a" })
  }

  /** `t` is the receive time in epoch milliseconds, which ReplayCommand uses to keep the original pacing. */
  write(buffer: Buffer, from: RemoteInfo) {
    this.stream.write(JSON.stringify({ t: Date.now(), from: `${from.address}:${from.port}`, hex: buffer.toString("hex") }) + "\n")
  }

  /** Resolves once everything is flushed; always await it before the process exits. */
  close() {
    return new Promise<void>(resolve => this.stream.end(resolve))
  }
}
