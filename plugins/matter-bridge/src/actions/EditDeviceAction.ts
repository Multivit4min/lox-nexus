import { Action, z } from "@lox-nexus/plugin-sdk"
import { nameSchema } from "../config/BridgeConfig.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"

const input = z.object({
  device: z.string().min(1).meta({ title: "Device", description: "The device's id, as the Devices table shows it" }),
  name: nameSchema().meta({ title: "Name", description: "The new name; the device stays the same in the apps" })
})

/** Renames a device; the type stays (remove and add to change it). A door lock has Edit lock, which also sets unlocking. */
export class EditDeviceAction extends Action<MatterBridgePlugin, z.infer<typeof input>> {
  static readonly id = "edit-device"
  static readonly label = "Edit device"
  static readonly description = "Renames a device; it stays the same device in the apps"
  static readonly input = input
  static readonly confirm = "Save? The new name shows in every app."
  /** a button on each row of the Devices table */
  static readonly placement = "panel"

  async run() {
    const device = await this.plugin.manager.edit(this.input.device, this.input.name)
    return `Saved ${device.name}. Alexa may show the old name until you rename it there or run "Discover devices"`
  }
}
