import { createWriteStream, type WriteStream } from "node:fs"
import type { RemoteInfo } from "node:dgram"

/** Appends received datagrams as JSONL ({ t, from, hex }), the format used by test fixtures. */
export class CaptureLog {
  private readonly stream: WriteStream

  constructor(file: string) {
    this.stream = createWriteStream(file, { flags: "a" })
  }

  write(buffer: Buffer, from: RemoteInfo) {
    this.stream.write(JSON.stringify({ t: Date.now(), from: `${from.address}:${from.port}`, hex: buffer.toString("hex") }) + "\n")
  }

  close() {
    return new Promise<void>(resolve => this.stream.end(resolve))
  }
}
