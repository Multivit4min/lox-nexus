import { Action, z } from "@lox-nexus/plugin-sdk"
import { DeviceTypes } from "../config/DeviceTypes.ts"
import { nameSchema } from "../config/BridgeConfig.ts"
import { DEVICE_TYPE_IDS, type DeviceTypeId } from "../devices/DeviceKinds.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"

const name = () => nameSchema().meta({ title: "Name", description: "What Alexa and the other apps call the device, e.g. Kitchen light; unique, at most 32 bytes" })
type Types = [DeviceTypeId, ...DeviceTypeId[]]
const batteryTypes = DeviceTypes.withBattery() as Types
const others = DEVICE_TYPE_IDS.filter(type => type !== "door-lock" && !batteryTypes.includes(type)) as Types
const typeChoice = (types: Types) => z.enum(types).meta({
  title: "Type", description: "What kind of device the apps show; can't be changed later",
  enumLabels: Object.fromEntries(types.map(type => [type, DeviceTypes.labels()[type]]))
})

/**
 * by type: only a door lock has Allow unlocking and only sensors and buttons a battery, so the form
 * shows each only for those; the type choice lists the branches in order (the lock after the valve)
 */
const input = z.discriminatedUnion("type", [
  z.object({ type: typeChoice(others), name: name() }),
  z.object({
    type: z.literal("door-lock").meta({ title: DeviceTypes.labels()["door-lock"] }),
    name: name(),
    allowUnlock: z.boolean().default(false).meta({ title: "Allow unlocking", description: "Whether Alexa and the other apps may unlock. Off: they can only lock" })
  }),
  z.object({
    type: typeChoice(batteryTypes),
    name: name(),
    battery: z.boolean().default(false).meta({ title: "Battery", description: "Whether the apps show a battery level, sent by Nexus; can't be changed later" })
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
    const device = await this.plugin.manager.add(name, type, {
      allowUnlock: "allowUnlock" in this.input && this.input.allowUnlock,
      battery: "battery" in this.input && this.input.battery
    })
    return `Added ${device.name} (${device.id}). In the Alexa app it may take a minute to appear, or need "Discover devices"`
  }
}
