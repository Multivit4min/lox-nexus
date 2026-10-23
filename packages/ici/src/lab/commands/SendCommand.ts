import { parseArgs } from "node:util"
import { PacketEncoder } from "../../codec/PacketEncoder.ts"
import { IciCipher } from "../../crypto/IciCipher.ts"
import { DataPacket } from "../../packet/DataPacket.ts"
import { PayloadCodecs } from "../../payload/PayloadCodecs.ts"
import { IciSocket } from "../../transport/IciSocket.ts"
import { Args } from "../Args.ts"
import { DataTypeNames } from "../DataTypeNames.ts"
import type { LabCommand, LabContext } from "../LabCommand.ts"
import { ValueParser } from "../ValueParser.ts"

/**
 * Sends one hand-built datagram, from a typed value or raw payload bytes (`--raw`, for probing
 * unconfirmed layouts). It is an active send to a real system, so only run it against a Miniserver
 * you may change. `--password` seals the packet as 0x9F, which RemotePeer itself cannot send.
 */
export class SendCommand implements LabCommand {
  readonly name = "send"
  readonly usage = "send --host <h> --port <n> --src <id> --dst <id> --packet <id> --type <t> (--value <v> | --raw <hex>) [--password <p>] [--from-port <n>]"
  readonly interruptible = false
  private readonly encoder = new PacketEncoder()

  async run(args: string[], { out }: LabContext) {
    const { values: v } = parseArgs({ args, options: {
      host: { type: "string" }, port: { type: "string" }, src: { type: "string" }, dst: { type: "string" },
      packet: { type: "string" }, type: { type: "string" }, value: { type: "string" }, raw: { type: "string" },
      password: { type: "string" }, "from-port": { type: "string", default: "0" }
    } })
    const host = Args.required(v.host, "host")
    const port = Args.port(v.port, "port")
    const type = DataTypeNames.parse(Args.required(v.type, "type"))
    const payload = v.raw !== undefined
      ? Args.hex(v.raw, "--raw")
      : PayloadCodecs.for(type).encode(new ValueParser().parse(type, Args.required(v.value, "value")))
    const packet = new DataPacket(Args.required(v.src, "src"), Args.required(v.dst, "dst"), Args.required(v.packet, "packet"), type, payload)
    const datagram = v.password
      ? this.encoder.encodeEncrypted(new IciCipher(v.password).seal(packet))
      : this.encoder.encodeData(packet)
    const socket = new IciSocket()
    await socket.bind(Args.port(v["from-port"], "from-port"))
    try {
      await socket.send(datagram, port, host)
      out.write(`sent ${datagram.length} bytes to ${host}:${port}: ${datagram.toString("hex")}\n`)
    } finally {
      await socket.close()
    }
  }
}
