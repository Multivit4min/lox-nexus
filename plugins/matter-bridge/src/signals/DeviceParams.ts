import { signalGroup, z } from "@lox-nexus/plugin-sdk"

/** Every signal of the bridge belongs to one device, named here by its id (stable across renames). */
export const deviceParamsSchema = z.object({
  device: signalGroup(z.string().min(1).meta({
    title: "Device",
    description: "The device's id, as the bridge's Devices table shows it, e.g. kitchen-light-3f2a"
  }))
})

export type DeviceParams = z.infer<typeof deviceParamsSchema>
