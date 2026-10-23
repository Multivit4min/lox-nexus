import { CaptureCommand } from "./commands/CaptureCommand.ts"
import { DecodeCommand } from "./commands/DecodeCommand.ts"
import { ReplayCommand } from "./commands/ReplayCommand.ts"
import { SendCommand } from "./commands/SendCommand.ts"
import type { LabCommand, LabContext } from "./LabCommand.ts"
import { DataTypeNames } from "./DataTypeNames.ts"

/** ici-lab: capture, decode, send and replay ICI datagrams for protocol research. */
export class LabCli {
  private readonly commands: LabCommand[] = [new CaptureCommand(), new SendCommand(), new ReplayCommand(), new DecodeCommand()]

  /** returns the process exit code */
  async run(argv: string[], context: LabContext): Promise<number> {
    const [name, ...args] = argv
    const command = this.commands.find(c => c.name === name)
    if (!command) {
      context.out.write(this.help())
      return name === undefined || name === "help" ? 0 : 1
    }
    try {
      await command.run(args, context)
      return 0
    } catch (error) {
      context.out.write(`error: ${(error as Error).message}\n`)
      return 1
    }
  }

  private help() {
    const lines = this.commands.map(c => `  ${c.usage}`)
    return ["usage: npm run ici-lab -- <command>", "", ...lines, "", `types: ${DataTypeNames.list()}`, ""].join("\n")
  }
}
