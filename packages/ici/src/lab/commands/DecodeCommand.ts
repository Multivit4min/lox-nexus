import { PacketDecoder } from "../../codec/PacketDecoder.ts"
import { Args } from "../Args.ts"
import type { LabCommand, LabContext } from "../LabCommand.ts"
import { PacketDescriber } from "../PacketDescriber.ts"

/** Offline: describes hex datagrams given on the command line. */
export class DecodeCommand implements LabCommand {
  readonly name = "decode"
  readonly usage = "decode <hex> [<hex> …]"
  readonly interruptible = false
  private readonly decoder = new PacketDecoder()
  private readonly describer = new PacketDescriber()

  async run(args: string[], { out }: LabContext) {
    if (args.length === 0) throw new Error(`usage: ${this.usage}`)
    for (const hex of args) {
      const buffer = Args.hex(hex, "datagram")
      out.write(this.describer.describe(this.decoder.decode(buffer), buffer) + "\n")
    }
  }
}
