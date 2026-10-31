import { Action, z } from "@lox-nexus/plugin-sdk"
import { DeviceGroups, type DeviceGroup } from "../config/DeviceGroups.ts"
import { DeviceTypes } from "../config/DeviceTypes.ts"
import { nameSchema } from "../config/BridgeConfig.ts"
import type { DeviceTypeId } from "../devices/DeviceKinds.ts"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"

const name = () => nameSchema().meta({ title: "Name", description: "What Alexa and the other apps call the device, e.g. Kitchen light; unique, at most 32 bytes" })

/** a group's fields: the second choice where it has several types, unlocking for the lock, a battery where every type may have one */
const branch = (group: DeviceGroup) => {
  const types: [DeviceTypeId, ...DeviceTypeId[]] = [group.types[0].type, ...group.types.slice(1).map(entry => entry.type)]
  return z.object({
    // an enum of one, not a literal: the form takes the type choice's title and description from enums
    type: z.enum([group.id]).meta({
      title: "Type", description: "What kind of device the apps show; can't be changed later", enumLabels: { [group.id]: group.label }
    }),
    ...(group.choice ? {
      [group.choice.field]: z.enum(types).meta({
        title: group.choice.title, description: "Can't be changed later",
        enumLabels: Object.fromEntries(group.types.map(entry => [entry.type, entry.label]))
      })
    } : {}),
    name: name(),
    ...(types.includes("door-lock") ? {
      allowUnlock: z.boolean().default(false).meta({ title: "Allow unlocking", description: "Whether Alexa and the other apps may unlock. Off: they can only lock" })
    } : {}),
    ...(types.every(type => DeviceTypes.info(type).battery) ? {
      battery: z.boolean().default(false).meta({ title: "Battery", description: "Whether the apps show a battery level, sent by Nexus; can't be changed later" })
    } : {})
  })
}

/** the group's id, its second choice under the group's own field, the name and the extras */
interface Input { type: string; name: string; allowUnlock?: boolean; battery?: boolean; [choice: string]: unknown }

/**
 * By kind of device: close types (lights, thermostats, sensors) are one choice with a second one,
 * so the type list stays short; only a door lock has Allow unlocking, only battery-powered sensors
 * and buttons a Battery. Built from the groups, so zod can't infer the union: the form test parses
 * one input per kind of branch.
 */
const input = z.discriminatedUnion("type", DeviceGroups.all.map(branch) as unknown as [z.ZodObject, ...z.ZodObject[]]) as unknown as z.ZodType<Input>

/** Adds a device to the running bridge, at most 50. */
export class AddDeviceAction extends Action<MatterBridgePlugin, Input> {
  static readonly id = "add-device"
  static readonly label = "Add device"
  static readonly description = "Shows a new device to the paired apps. Wire its signals afterwards; the catalog lists them"
  static readonly input = input
  /** its button is above the Devices table */
  static readonly placement = "panel"

  async run() {
    const { name, allowUnlock, battery } = this.input
    const type = DeviceGroups.type(this.input)
    const device = await this.plugin.manager.add(name, type, { allowUnlock, battery })
    return `Added ${device.name} (${device.id}). In the Alexa app it may take a minute to appear, or need "Discover devices"`
  }
}
