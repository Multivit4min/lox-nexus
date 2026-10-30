import { Action, z } from "@lox-nexus/plugin-sdk"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"

const input = z.object({
  device: z.string().min(1).meta({ title: "Device", description: "The device's id, as the Devices table shows it" })
})

/** Removes a device from the bridge; its signals fail until they are removed or pointed elsewhere. */
export class RemoveDeviceAction extends Action<MatterBridgePlugin, z.infer<typeof input>> {
  static readonly id = "remove-device"
  static readonly label = "Remove device"
  /** a button on each row of the Devices table */
  static readonly placement = "panel"
  static readonly description = "The apps lose the device. Its signals in Nexus stay, in the error state, until you remove them"
  static readonly input = input
  static readonly confirm = "Remove this device? Alexa and the other apps lose it, and their routines with it stop working."

  async run() {
    const device = await this.plugin.manager.remove(this.input.device)
    return `Removed ${device.name}. Remove its signals in Nexus too, and the device in the Alexa app if it stays there as unresponsive`
  }
}
