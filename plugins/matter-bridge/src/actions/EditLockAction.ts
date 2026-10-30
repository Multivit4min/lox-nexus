import { Action, z } from "@lox-nexus/plugin-sdk"
import { nameSchema } from "../config/BridgeConfig.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"

const input = z.object({
  device: z.string().min(1).meta({ title: "Device", description: "The lock's id, as the Devices table shows it" }),
  name: nameSchema().meta({ title: "Name", description: "The new name; the lock stays the same in the apps" }),
  allowUnlock: z.boolean().meta({ title: "Allow unlocking", description: "Whether Alexa and the other apps may unlock it. Off: they can only lock" })
})

/** Renames a door lock and sets whether the apps may unlock it. */
export class EditLockAction extends Action<MatterBridgePlugin, z.infer<typeof input>> {
  static readonly id = "edit-lock"
  static readonly label = "Edit lock"
  static readonly description = "Renames a door lock, and allows or forbids unlocking it from the apps"
  static readonly input = input
  static readonly confirm = "Save? With Allow unlocking on, Alexa and the other apps can open the door."
  /** a button on each lock's row of the Devices table */
  static readonly placement = "panel"

  async run() {
    const existing = this.plugin.devices.get(this.input.device)
    if (existing && existing.type !== "door-lock") throw new Error(`${existing.name} is not a door lock; use Edit device`)
    const device = await this.plugin.manager.edit(this.input.device, this.input.name, this.input.allowUnlock)
    return `Saved ${device.name}; unlocking from the apps is ${device.allowUnlock ? "allowed" : "refused"}`
  }
}
