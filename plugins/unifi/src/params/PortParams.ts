import { signalGroup, z } from "@lox-nexus/plugin-sdk"
import { deviceMac } from "./DeviceParams.ts"

/** One port of a UniFi switch (or gateway): the device and the port's number, grouped as "device ▸ port". */
export const portParamsSchema = z.object({
  device: deviceMac,
  port: signalGroup(z.number().int().min(1).meta({
    title: "Port",
    description: "The port's number as the console shows it, from 1"
  }))
})

export type PortParams = z.infer<typeof portParamsSchema>
