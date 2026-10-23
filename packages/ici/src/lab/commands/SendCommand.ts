import { parseArgs } from "node:util"
import { PacketEncoder } from "../../codec/PacketEncoder.ts"
import { IciCipher } from "../../crypto/IciCipher.ts"
import { DataPacket } from "../../packet/DataPacket.ts"
import { IciSocket } from "../../transport/IciSocket.ts"
import { DataTypeNames } from "../DataTypeNames.ts"
import type { LabCommand, LabContext } from "../LabCommand.ts"
import { ValueParser } from "../ValueParser.ts"

export class SendCommand implements LabCommand {
  readonly name = "send"
  readonly usage = "send --host <h> --port <n> --src <id> --dst <id> --packet <id> --type <t> (--value <v> | --raw <hex>) [--password <p>] [--from-port <n>]"
  private readonly encoder = new PacketEncoder()

  async run(args: string[], { out }: LabContext) {
    const { values: v } = parseArgs({ args, options: {
      host: { type: "string" }, port: { type: "string" }, src: { type: "string" }, dst: { type: "string" },
      packet: { type: "string" }, type: { type: "string" }, value: { type: "string" }, raw: { type: "string" },
      password: { type: "string" }, "from-port": { type: "string", default: "0" }
    } })
    if (!v.host || !v.port || !v.src || !v.dst || !v.packet || !v.type || (v.value === undefined && !v.raw)) {
      throw new Error(`usage: ${this.usage}`)
    }
    const type = DataTypeNames.parse(v.type)
    const payload = v.raw ? Buffer.from(v.raw, "hex") : DataPacket.of({ sourceId: v.src, targetId: v.dst, packetId: v.packet }, type, new ValueParser().parse(type, v.value!)).payload
    const packet = new DataPacket(v.src, v.dst, v.packet, type, payload)
    const datagram = v.password
      ? this.encoder.encodeEncrypted(new IciCipher(v.password).seal(packet))
      : this.encoder.encodeData(packet)
    const socket = new IciSocket()
    await socket.bind(Number(v["from-port"]))
    try {
      await socket.send(datagram, Number(v.port), v.host)
      out.write(`sent ${datagram.length} bytes to ${v.host}:${v.port}: ${datagram.toString("hex")}\n`)
    } finally {
      await socket.close()
    }
  }
}
