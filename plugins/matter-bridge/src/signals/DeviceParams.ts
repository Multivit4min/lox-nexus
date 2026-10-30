import { signalGroup, z } from "@lox-nexus/plugin-sdk"

/** Every signal of the bridge belongs to one configured device, named here. */
export const deviceParamsSchema = z.object({
  device: signalGroup(z.string().min(1).meta({
    title: "Device",
    description: "The device's name exactly as in the bridge's settings (Devices)"
  }))
})

export type DeviceParams = z.infer<typeof deviceParamsSchema>
