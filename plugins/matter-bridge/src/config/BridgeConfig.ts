import { z } from "@lox-nexus/plugin-sdk"
import { DEVICE_TYPE_IDS } from "../devices/DeviceKinds.ts"
import { DeviceTypes } from "./DeviceTypes.ts"

/** Matter strings such as a device's label are limited in bytes, not characters */
const label = () => z.string().trim().min(1).max(32)
  .refine(text => Buffer.byteLength(text) <= 32, "at most 32 bytes (letters like ä or é count twice)")

const deviceSchema = z.object({
  name: label().meta({ title: "Name", description: "What Alexa and the other apps call the device, e.g. Kitchen light. Renaming it makes a new device there" }),
  type: z.enum(DEVICE_TYPE_IDS).meta({ title: "Type", description: "What kind of device the apps show", enumLabels: DeviceTypes.labels() })
})

/** names are compared like Alexa compares them: case-insensitive */
function duplicateNames(devices: readonly { name: string }[]) {
  const seen = new Set<string>()
  return devices.map(device => device.name.toLowerCase()).filter(name => seen.has(name) || !seen.add(name))
}

/** Instance config: the bridge's name and port, and the devices it shows. */
export const bridgeConfigSchema = z.object({
  name: label().default("Lox Nexus").meta({ title: "Bridge name", description: "How the bridge shows in Alexa, Google Home, Apple Home and Home Assistant" }),
  port: z.number().int().min(1024).max(65535).default(5540).meta({
    title: "UDP port",
    description: "The Matter port. Change it if another Matter program on this host (Home Assistant's Matter Server, Matterbridge) already uses 5540"
  }),
  devices: z.array(deviceSchema).max(50, "at most 50 devices (Alexa's limit for one bridge)").default([])
    .superRefine((devices, context) => {
      for (const name of new Set(duplicateNames(devices))) context.addIssue({ code: "custom", message: `the device name "${name}" is used twice` })
    })
    .meta({ title: "Devices", description: "Up to 50 devices with unique names. Wire their signals on the instance page" })
})

export type BridgeConfig = z.infer<typeof bridgeConfigSchema>
export type DeviceConfig = BridgeConfig["devices"][number]
