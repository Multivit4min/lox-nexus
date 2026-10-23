import { readFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { parseArgs } from "node:util"
import { IciSocket } from "../../transport/IciSocket.ts"
import type { LabCommand, LabContext } from "../LabCommand.ts"

interface Recorded {
  t: number
  hex: string
}

export class ReplayCommand implements LabCommand {
  readonly name = "replay"
  readonly usage = "replay <file.jsonl> --host <h> --port <n> [--speed <factor>]"

  async run(args: string[], { out, signal }: LabContext) {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
      host: { type: "string" }, port: { type: "string" }, speed: { type: "string", default: "1" }
    } })
    const [file] = positionals
    if (!file || !values.host || !values.port) throw new Error(`usage: ${this.usage}`)
    const records = this.load(file)
    const socket = new IciSocket()
    await socket.bind(0)
    try {
      await this.replay(records, socket, values.host, Number(values.port), Number(values.speed), signal)
      out.write(`replayed ${records.length} datagrams\n`)
    } finally {
      await socket.close()
    }
  }

  private load(file: string): Recorded[] {
    return readFileSync(file, "utf8").trim().split("\n")
      .map(line => JSON.parse(line) as Partial<Recorded>)
      .filter((r): r is Recorded => typeof r.hex === "string" && typeof r.t === "number")
  }

  private async replay(records: Recorded[], socket: IciSocket, host: string, port: number, speed: number, signal: AbortSignal) {
    let previous = records[0]?.t ?? 0
    for (const record of records) {
      await sleep(Math.max(0, (record.t - previous) / speed), undefined, { signal })
      previous = record.t
      await socket.send(Buffer.from(record.hex, "hex"), port, host)
    }
  }
}
