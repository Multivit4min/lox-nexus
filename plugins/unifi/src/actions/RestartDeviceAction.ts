import { Action } from "@lox-nexus/plugin-sdk"
import { deviceParamsSchema, type DeviceParams } from "../params/DeviceParams.ts"
import type { UnifiPlugin } from "../UnifiPlugin.ts"

/** The Restart button on a row of the Devices table. */
export class RestartDeviceAction extends Action<UnifiPlugin, DeviceParams> {
  static readonly id = "restart-device"
  static readonly label = "Restart"
  static readonly description = "Restarts the device; it is offline for a minute or two"
  static readonly input = deviceParamsSchema
  static readonly placement = "panel"
  static readonly confirm = "Restart this device? Everything connected through it is offline for a minute or two."

  async run() {
    const name = await this.plugin.commands.restart(this.input.device)
    this.plugin.log.info(`restarting ${name} from the panel`)
    return `${name} is restarting`
  }
}
