import { Action } from "@lox-nexus/plugin-sdk"
import { portParamsSchema, type PortParams } from "../params/PortParams.ts"
import type { UnifiPlugin } from "../UnifiPlugin.ts"

/** The Power-cycle button on a PoE row of the Ports table. */
export class PowerCycleAction extends Action<UnifiPlugin, PortParams> {
  static readonly id = "power-cycle-port"
  static readonly label = "Power-cycle"
  static readonly description = "Cuts the port's PoE power briefly, which restarts what it powers"
  static readonly input = portParamsSchema
  static readonly placement = "panel"
  static readonly confirm = "Power-cycle this port? The device it powers restarts."

  async run() {
    const { device, port } = this.input
    const name = await this.plugin.commands.powerCycle(device, port)
    this.plugin.log.info(`power-cycling port ${port} of ${name} from the panel`)
    return `Port ${port} of ${name} is power-cycling`
  }
}
