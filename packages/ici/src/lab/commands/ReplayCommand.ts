import { readFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { parseArgs } from "node:util"
import { IciSocket } from "../../transport/IciSocket.ts"
import { Args } from "../Args.ts"
import type { LabCommand, LabContext } from "../LabCommand.ts"

interface Recorded {
  t: number
  hex: string
}

export class ReplayCommand implements LabCommand {
  readonly name = "replay"
  readonly usage = "replay <file.jsonl> --host <h> --port <n> [--speed <factor>]"
  readonly interruptible = true

  async run(args: string[], { out, signal }: LabContext) {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
      host: { type: "string" }, port: { type: "string" }, speed: { type: "string", default: "1" }
    } })
    const [file] = positionals
    if (!file) throw new Error(`usage: ${this.usage}`)
    const target = { host: Args.required(values.host, "host"), port: Args.port(values.port, "port") }
    const speed = Args.positive(values.speed, "speed")
    const records = this.load(file)
    const socket = new IciSocket()
    await socket.bind(0)
    try {
      const sent = await this.replay(records, socket, target, speed, signal)
      out.write(`replayed ${sent} of ${records.length} datagrams${signal.aborted ? " (interrupted)" : ""}\n`)
    } finally {
      await socket.close()
    }
  }

  private load(file: string): Recorded[] {
    return readFileSync(file, "utf8").trim().split("\n")
      .map(line => JSON.parse(line) as Partial<Recorded>)
      .filter((r): r is Recorded => typeof r.hex === "string" && typeof r.t === "number")
  }

  /** returns how many datagrams were sent before the end or an interrupt */
  private async replay(records: Recorded[], socket: IciSocket, target: { host: string, port: number }, speed: number, signal: AbortSignal) {
    let previous = records[0]?.t ?? 0
    let sent = 0
    for (const record of records) {
      try {
        await sleep(Math.max(0, (record.t - previous) / speed), undefined, { signal })
      } catch {
        return sent
      }
      previous = record.t
      await socket.send(Buffer.from(record.hex, "hex"), target.port, target.host)
      sent++
    }
    return sent
  }
}
