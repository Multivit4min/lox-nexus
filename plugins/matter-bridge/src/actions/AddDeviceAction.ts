import { Action, z } from "@lox-nexus/plugin-sdk"
import { DeviceTypes } from "../config/DeviceTypes.ts"
import { nameSchema } from "../config/BridgeConfig.ts"
import { DEVICE_TYPE_IDS, type DeviceTypeId } from "../devices/DeviceKinds.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"

const name = () => nameSchema().meta({ title: "Name", description: "What Alexa and the other apps call the device, e.g. Kitchen light; unique, at most 32 bytes" })
const others = DEVICE_TYPE_IDS.filter(type => type !== "door-lock") as [Exclude<DeviceTypeId, "door-lock">, ...Array<Exclude<DeviceTypeId, "door-lock">>]

/** by type: only a door lock has Allow unlocking, so the form shows it only for one */
const input = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(others).meta({
      title: "Type", description: "What kind of device the apps show; can't be changed later",
      enumLabels: Object.fromEntries(others.map(type => [type, DeviceTypes.labels()[type]]))
    }),
    name: name()
  }),
  z.object({
    type: z.literal("door-lock").meta({ title: DeviceTypes.labels()["door-lock"] }),
    name: name(),
    allowUnlock: z.boolean().default(false).meta({ title: "Allow unlocking", description: "Whether Alexa and the other apps may unlock. Off: they can only lock" })
  })
])

/** Adds a device to the running bridge, at most 50. */
export class AddDeviceAction extends Action<MatterBridgePlugin, z.infer<typeof input>> {
  static readonly id = "add-device"
  static readonly label = "Add device"
  static readonly description = "Shows a new device to the paired apps. Wire its signals afterwards; the catalog lists them"
  static readonly input = input
  /** its button is above the Devices table */
  static readonly placement = "panel"

  async run() {
    const { name, type } = this.input
    const device = await this.plugin.manager.add(name, type, this.input.type === "door-lock" && this.input.allowUnlock)
    return `Added ${device.name} (${device.id}). In the Alexa app it may take a minute to appear, or need "Discover devices"`
  }
}
