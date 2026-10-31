import { Actuator, type ActuatorCommand } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { MacAddress } from "../api/MacAddress.ts"
import { deviceParamsSchema, type DeviceParams } from "../params/DeviceParams.ts"
import type { UnifiPlugin } from "../UnifiPlugin.ts"
import { PulseEdge } from "./PulseEdge.ts"

/**
 * Restarts a device on a pulse ("Device restart request"). Drastic, so only a new rising true
 * counts: never a repeated true, and never a value the host replays after a start, so restarting
 * Nexus never restarts a device.
 */
export class DeviceRestartActuator extends Actuator<UnifiPlugin, DeviceParams, ValueOf<"boolean">> {
  static readonly id = "device-restart"
  static readonly label = "Restart device"
  static readonly description = "Restarts the access point, switch or gateway on a pulse (a rising true)"
  static readonly params = deviceParamsSchema
  static readonly accepts = "boolean"
  private readonly edge = new PulseEdge()

  async run(value: ValueOf<"boolean">, command?: ActuatorCommand) {
    if (!this.edge.rises(value.value, command?.replayed)) return
    const mac = MacAddress.normalize(this.params.device)
    // the command's cause is attached to this line, which tells who asked
    this.plugin.log.info(`restarting device ${mac}, asked by signal "${this.signal.label}"`)
    const name = await this.plugin.commands.restart(mac)
    this.plugin.log.info(`${name} is restarting`)
  }
}
