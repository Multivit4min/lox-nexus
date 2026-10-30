import { Action, z } from "@lox-nexus/plugin-sdk"
import { nameSchema } from "../config/BridgeConfig.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"

const input = z.object({
  device: z.string().min(1).meta({ title: "Device", description: "The device's id, as the Devices table shows it" }),
  name: nameSchema().meta({ title: "Name", description: "The new name; the device stays the same in the apps" }),
  allowUnlock: z.boolean().optional().meta({
    title: "Allow unlocking",
    description: "Door locks only: whether Alexa and the other apps may unlock it. Left empty, it stays as it is"
  })
})

/** Renames a device, or changes whether a lock may be unlocked; the type stays (remove and add to change it). */
export class EditDeviceAction extends Action<MatterBridgePlugin, z.infer<typeof input>> {
  static readonly id = "edit-device"
  static readonly label = "Edit device"
  static readonly description = "Renames a device (it stays the same device in the apps), or allows or forbids unlocking a lock"
  static readonly input = input
  static readonly confirm = "Save? A new name shows in every app. For a door lock with Allow unlocking on, Alexa and the other apps can open the door."

  async run() {
    const device = await this.plugin.manager.edit(this.input.device, this.input.name, this.input.allowUnlock)
    const unlock = device.type === "door-lock" ? `; unlocking from the apps is ${device.allowUnlock ? "allowed" : "refused"}` : ""
    return `Saved ${device.name}${unlock}. Alexa may show the old name until you rename it there or run "Discover devices"`
  }
}
