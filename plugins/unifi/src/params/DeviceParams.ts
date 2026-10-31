import { signalGroup, z } from "@lox-nexus/plugin-sdk"
import { MacAddress } from "../api/MacAddress.ts"

/** the MAC address that names a UniFi device: printed on it, stable across renames and readable in signal lists */
export const deviceMac = signalGroup(z.string().regex(MacAddress.pattern, "a MAC address such as 74:ac:b9:00:00:01").meta({
  title: "Device",
  description: "The device's MAC address, e.g. 74:ac:b9:00:00:01. Easier: add it from the catalog"
}))

/** A UniFi device (access point, switch, gateway), by MAC address. */
export const deviceParamsSchema = z.object({ device: deviceMac })

export type DeviceParams = z.infer<typeof deviceParamsSchema>
