import type { RemoteInfo } from "node:dgram"
import { setTimeout as sleep } from "node:timers/promises"
import { parseArgs } from "node:util"
import { PacketDecoder } from "../../codec/PacketDecoder.ts"
import type { DecodeResult } from "../../codec/DecodeResult.ts"
import { IciCipher } from "../../crypto/IciCipher.ts"
import { IciSocket } from "../../transport/IciSocket.ts"
import { Args } from "../Args.ts"
import { CaptureFilter } from "../CaptureFilter.ts"
import { CaptureLog } from "../CaptureLog.ts"
import type { LabCommand, LabContext } from "../LabCommand.ts"
import { PacketDescriber } from "../PacketDescriber.ts"
import { PayloadDiff } from "../PayloadDiff.ts"

/**
 * Listens on a UDP port and prints every datagram with a payload diff against the previous one of
 * the same (source, target, packet id). This is the main tool for confirming PROTOCOL.md fields.
 */
export class CaptureCommand implements LabCommand {
  readonly name = "capture"
  readonly usage = "capture [--port <n>, default 61263] [--bind <addr>] [--only <id,id>] [--record <file.jsonl>] [--duration <s>] [--password <p>]"
  readonly interruptible = true
  private readonly decoder = new PacketDecoder()
  private readonly diff = new PayloadDiff()

  async run(args: string[], { out, signal }: LabContext) {
    const { values } = parseArgs({ args, options: {
      port: { type: "string", default: String(IciSocket.DEFAULT_PORT) }, bind: { type: "string" }, only: { type: "string" },
      record: { type: "string" }, duration: { type: "string" }, password: { type: "string" }
    } })
    const port = Args.port(values.port, "port")
    const duration = values.duration === undefined ? undefined : Args.positive(values.duration, "duration")
    const cipher = values.password === undefined ? undefined : new IciCipher(values.password)
    const describer = new PacketDescriber(cipher)
    const filter = new CaptureFilter(values.only?.split(","), cipher)
    const socket = new IciSocket()
    await socket.bind(port, values.bind)
    const log = values.record ? new CaptureLog(values.record) : undefined
    try {
      socket.on("datagram", (buffer, from) => {
        log?.write(buffer, from)
        const line = this.line(describer, this.decoder.decode(buffer), buffer, from, filter)
        if (line) out.write(line + "\n")
      })
      out.write(`listening on ${values.bind ?? "0.0.0.0"}:${port}${log ? `, recording to ${values.record}` : ""}\n`)
      await this.waitUntilDone(signal, duration)
    } finally {
      await socket.close()
      await log?.close()
    }
  }

  private line(describer: PacketDescriber, result: DecodeResult, buffer: Buffer, from: RemoteInfo, filter: CaptureFilter) {
    if (!filter.shows(result)) return undefined
    const time = new Date().toISOString().slice(11, 23)
    const delta = result.kind === "data"
      ? this.diff.next(`${result.packet.sourceId}/${result.packet.targetId}/${result.packet.packetId}`, result.packet.payload)
      : ""
    return `${time} ${from.address}:${from.port}  ${describer.describe(result, buffer)}${delta ? `  ${delta}` : ""}`
  }

  // a timer that is never reached: node's sleep needs a finite delay, 2^31-1 ms (~24.8 days) is the maximum
  private async waitUntilDone(signal: AbortSignal, durationSeconds?: number) {
    try {
      await sleep(durationSeconds ? durationSeconds * 1000 : 2 ** 31 - 1, undefined, { signal })
    } catch {
      // aborted by Ctrl+C
    }
  }
}
