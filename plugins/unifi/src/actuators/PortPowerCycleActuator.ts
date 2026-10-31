import { Actuator, type ActuatorCommand } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { MacAddress } from "../api/MacAddress.ts"
import { portParamsSchema, type PortParams } from "../params/PortParams.ts"
import type { UnifiPlugin } from "../UnifiPlugin.ts"
import { PulseEdge } from "./PulseEdge.ts"

/**
 * Switches a port's PoE off and on again on a pulse ("Port PoE power-cycle request"), which
 * restarts what the port powers (a camera, an access point). Only a new rising true counts, never
 * a repeat or a replayed value.
 */
export class PortPowerCycleActuator extends Actuator<UnifiPlugin, PortParams, ValueOf<"boolean">> {
  static readonly id = "port-power-cycle"
  static readonly label = "Power-cycle PoE port"
  static readonly description = "Cuts the port's PoE power briefly on a pulse (a rising true), restarting what it powers"
  static readonly params = portParamsSchema
  static readonly accepts = "boolean"
  private readonly edge = new PulseEdge()

  async run(value: ValueOf<"boolean">, command?: ActuatorCommand) {
    if (!this.edge.rises(value.value, command?.replayed)) return
    const mac = MacAddress.normalize(this.params.device)
    this.plugin.log.info(`power-cycling port ${this.params.port} of ${mac}, asked by signal "${this.signal.label}"`)
    const name = await this.plugin.commands.powerCycle(mac, this.params.port)
    this.plugin.log.info(`port ${this.params.port} of ${name} is power-cycling`)
  }
}
