import { Action, z } from "@lox-nexus/plugin-sdk"
import { DeviceTypes } from "../config/DeviceTypes.ts"
import { nameSchema } from "../config/BridgeConfig.ts"
import { DEVICE_TYPE_IDS } from "../devices/DeviceKinds.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"

const input = z.object({
  name: nameSchema().meta({ title: "Name", description: "What Alexa and the other apps call the device, e.g. Kitchen light; unique, at most 32 bytes" }),
  type: z.enum(DEVICE_TYPE_IDS).meta({ title: "Type", description: "What kind of device the apps show; can't be changed later", enumLabels: DeviceTypes.labels() }),
  allowUnlock: z.boolean().default(false).meta({
    title: "Allow unlocking",
    description: "Door locks only: whether Alexa and the other apps may unlock. Off: they can only lock"
  })
})

/** Adds a device to the running bridge, at most 50. */
export class AddDeviceAction extends Action<MatterBridgePlugin, z.infer<typeof input>> {
  static readonly id = "add-device"
  static readonly label = "Add device"
  static readonly description = "Shows a new device to the paired apps. Wire its signals afterwards; the catalog lists them"
  static readonly input = input

  async run() {
    const { name, type, allowUnlock } = this.input
    const device = await this.plugin.manager.add(name, type, allowUnlock)
    return `Added ${device.name} (${device.id}). In the Alexa app it may take a minute to appear, or need "Discover devices"`
  }
}
