import { Action, z } from "@lox-nexus/plugin-sdk"
import { DeviceTypes } from "../config/DeviceTypes.ts"
import { nameSchema } from "../config/BridgeConfig.ts"
import { DEVICE_TYPE_IDS, type DeviceTypeId } from "../devices/DeviceKinds.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"

type Types = [DeviceTypeId, ...DeviceTypeId[]]
type Extra = "plain" | "lock" | "battery"

const name = () => nameSchema().meta({ title: "Name", description: "What Alexa and the other apps call the device, e.g. Kitchen light; unique, at most 32 bytes" })
const extras = {
  plain: {},
  lock: {
    allowUnlock: z.boolean().default(false).meta({ title: "Allow unlocking", description: "Whether Alexa and the other apps may unlock. Off: they can only lock" })
  },
  battery: {
    battery: z.boolean().default(false).meta({ title: "Battery", description: "Whether the apps show a battery level, sent by Nexus; can't be changed later" })
  }
}
const extra = (type: DeviceTypeId): Extra => type === "door-lock" ? "lock" : DeviceTypes.info(type).battery ? "battery" : "plain"

/** the types in their order, as runs of types with the same extra fields */
const runs = DEVICE_TYPE_IDS.reduce<{ extra: Extra; types: Types }[]>((all, type) => {
  const last = all.at(-1)
  if (last?.extra === extra(type)) last.types.push(type)
  else all.push({ extra: extra(type), types: [type] })
  return all
}, [])

/**
 * By type: only a door lock has Allow unlocking and only battery-powered sensors and buttons a
 * Battery, so the form shows each only for those. The form lists the types branch by branch, so
 * each run of types with the same fields is a branch, which keeps the types in their order.
 */
const input = z.discriminatedUnion("type", runs.map(({ extra, types }) => z.object({
  type: z.enum(types).meta({
    title: "Type", description: "What kind of device the apps show; can't be changed later",
    enumLabels: Object.fromEntries(types.map(type => [type, DeviceTypes.labels()[type]]))
  }),
  name: name(),
  ...extras[extra]
})) as unknown as [z.ZodObject, ...z.ZodObject[]]) as unknown as z.ZodType<Input>

interface Input { type: DeviceTypeId; name: string; allowUnlock?: boolean; battery?: boolean }

/** Adds a device to the running bridge, at most 50. */
export class AddDeviceAction extends Action<MatterBridgePlugin, Input> {
  static readonly id = "add-device"
  static readonly label = "Add device"
  static readonly description = "Shows a new device to the paired apps. Wire its signals afterwards; the catalog lists them"
  static readonly input = input
  /** its button is above the Devices table */
  static readonly placement = "panel"

  async run() {
    const { name, type, allowUnlock, battery } = this.input
    const device = await this.plugin.manager.add(name, type, { allowUnlock, battery })
    return `Added ${device.name} (${device.id}). In the Alexa app it may take a minute to appear, or need "Discover devices"`
  }
}
