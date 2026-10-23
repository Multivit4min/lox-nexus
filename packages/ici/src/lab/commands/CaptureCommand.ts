import type { RemoteInfo } from "node:dgram"
import { setTimeout as sleep } from "node:timers/promises"
import { parseArgs } from "node:util"
import { PacketDecoder } from "../../codec/PacketDecoder.ts"
import type { DecodeResult } from "../../codec/DecodeResult.ts"
import { IciSocket } from "../../transport/IciSocket.ts"
import { CaptureLog } from "../CaptureLog.ts"
import type { LabCommand, LabContext } from "../LabCommand.ts"
import { PacketDescriber } from "../PacketDescriber.ts"
import { PayloadDiff } from "../PayloadDiff.ts"

export class CaptureCommand implements LabCommand {
  readonly name = "capture"
  readonly usage = "capture --port <n> [--bind <addr>] [--only <id,id>] [--record <file.jsonl>] [--duration <s>]"
  private readonly decoder = new PacketDecoder()
  private readonly describer = new PacketDescriber()
  private readonly diff = new PayloadDiff()

  async run(args: string[], { out, signal }: LabContext) {
    const { values } = parseArgs({ args, options: {
      port: { type: "string" }, bind: { type: "string" }, only: { type: "string" },
      record: { type: "string" }, duration: { type: "string" }
    } })
    if (!values.port) throw new Error(`usage: ${this.usage}`)
    const only = values.only?.split(",")
    const log = values.record ? new CaptureLog(values.record) : undefined
    const socket = new IciSocket()
    socket.on("datagram", (buffer, from) => {
      log?.write(buffer, from)
      const line = this.line(this.decoder.decode(buffer), buffer, from, only)
      if (line) out.write(line + "\n")
    })
    await socket.bind(Number(values.port), values.bind)
    out.write(`listening on ${values.bind ?? "0.0.0.0"}:${values.port}${log ? `, recording to ${values.record}` : ""}\n`)
    await this.waitUntilDone(signal, values.duration)
    await socket.close()
    await log?.close()
  }

  private line(result: DecodeResult, buffer: Buffer, from: RemoteInfo, only?: string[]) {
    if (only && !(result.kind === "data" && only.includes(result.packet.packetId))) return undefined
    const time = new Date().toISOString().slice(11, 23)
    const delta = result.kind === "data"
      ? this.diff.next(`${result.packet.sourceId}/${result.packet.targetId}/${result.packet.packetId}`, result.packet.payload)
      : ""
    return `${time} ${from.address}:${from.port}  ${this.describer.describe(result, buffer)}${delta ? `  ${delta}` : ""}`
  }

  private async waitUntilDone(signal: AbortSignal, duration?: string) {
    try {
      await sleep(duration ? Number(duration) * 1000 : 2 ** 31 - 1, undefined, { signal })
    } catch {
      // aborted by Ctrl+C
    }
  }
}
