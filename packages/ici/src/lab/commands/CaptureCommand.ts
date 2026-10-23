import type { RemoteInfo } from "node:dgram"
import { setTimeout as sleep } from "node:timers/promises"
import { parseArgs } from "node:util"
import { PacketDecoder } from "../../codec/PacketDecoder.ts"
import type { DecodeResult } from "../../codec/DecodeResult.ts"
import { IciCipher } from "../../crypto/IciCipher.ts"
import { IciSocket } from "../../transport/IciSocket.ts"
import { Args } from "../Args.ts"
import { CaptureLog } from "../CaptureLog.ts"
import type { LabCommand, LabContext } from "../LabCommand.ts"
import { PacketDescriber } from "../PacketDescriber.ts"
import { PayloadDiff } from "../PayloadDiff.ts"

export class CaptureCommand implements LabCommand {
  readonly name = "capture"
  readonly usage = "capture --port <n> [--bind <addr>] [--only <id,id>] [--record <file.jsonl>] [--duration <s>] [--password <p>]"
  readonly interruptible = true
  private readonly decoder = new PacketDecoder()
  private readonly diff = new PayloadDiff()

  async run(args: string[], { out, signal }: LabContext) {
    const { values } = parseArgs({ args, options: {
      port: { type: "string" }, bind: { type: "string" }, only: { type: "string" },
      record: { type: "string" }, duration: { type: "string" }, password: { type: "string" }
    } })
    const port = Args.port(values.port, "port")
    const duration = values.duration === undefined ? undefined : Args.positive(values.duration, "duration")
    const describer = new PacketDescriber(values.password === undefined ? undefined : new IciCipher(values.password))
    const only = values.only?.split(",")
    const socket = new IciSocket()
    await socket.bind(port, values.bind)
    const log = values.record ? new CaptureLog(values.record) : undefined
    try {
      socket.on("datagram", (buffer, from) => {
        log?.write(buffer, from)
        const line = this.line(describer, this.decoder.decode(buffer), buffer, from, only)
        if (line) out.write(line + "\n")
      })
      out.write(`listening on ${values.bind ?? "0.0.0.0"}:${port}${log ? `, recording to ${values.record}` : ""}\n`)
      await this.waitUntilDone(signal, duration)
    } finally {
      await socket.close()
      await log?.close()
    }
  }

  private line(describer: PacketDescriber, result: DecodeResult, buffer: Buffer, from: RemoteInfo, only?: string[]) {
    if (only && !(result.kind === "data" && only.includes(result.packet.packetId))) return undefined
    const time = new Date().toISOString().slice(11, 23)
    const delta = result.kind === "data"
      ? this.diff.next(`${result.packet.sourceId}/${result.packet.targetId}/${result.packet.packetId}`, result.packet.payload)
      : ""
    return `${time} ${from.address}:${from.port}  ${describer.describe(result, buffer)}${delta ? `  ${delta}` : ""}`
  }

  private async waitUntilDone(signal: AbortSignal, durationSeconds?: number) {
    try {
      await sleep(durationSeconds ? durationSeconds * 1000 : 2 ** 31 - 1, undefined, { signal })
    } catch {
      // aborted by Ctrl+C
    }
  }
}
