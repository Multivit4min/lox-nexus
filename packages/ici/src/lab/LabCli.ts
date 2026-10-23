import { CaptureCommand } from "./commands/CaptureCommand.ts"
import { DecodeCommand } from "./commands/DecodeCommand.ts"
import { ReplayCommand } from "./commands/ReplayCommand.ts"
import { SendCommand } from "./commands/SendCommand.ts"
import type { LabCommand, LabContext } from "./LabCommand.ts"
import { DataTypeNames } from "./DataTypeNames.ts"

/** ici-lab: capture, decode, send and replay ICI datagrams for protocol research. */
export class LabCli {
  private readonly commands: LabCommand[] = [new CaptureCommand(), new SendCommand(), new ReplayCommand(), new DecodeCommand()]

  /** true if Ctrl+C should abort the command's signal instead of exiting at once */
  isInterruptible(name: string | undefined) {
    return this.commands.find(c => c.name === name)?.interruptible ?? false
  }

  /**
   * Runs one command line. Errors from a command are printed as `error: ...` and give exit code 1,
   * so a bad argument never produces a stack trace. No command or `help` prints usage with 0.
   * @returns the process exit code
   */
  async run(argv: string[], context: LabContext): Promise<number> {
    const [name, ...args] = argv
    const command = this.commands.find(c => c.name === name)
    if (!command) {
      const help = name === undefined || name === "help"
      ;(help ? context.out : context.err).write(this.help())
      return help ? 0 : 1
    }
    try {
      await command.run(args, context)
      return 0
    } catch (error) {
      context.err.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  private help() {
    const lines = this.commands.map(c => `  ${c.usage}`)
    return ["usage: npm run ici-lab -- <command>", "", ...lines, "", `types: ${DataTypeNames.list()}`, ""].join("\n")
  }
}
