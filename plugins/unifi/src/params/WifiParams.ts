import { signalGroup, z } from "@lox-nexus/plugin-sdk"

/** A Wi-Fi network (the API's "Wifi broadcast"), by its name. */
export const wifiParamsSchema = z.object({
  network: signalGroup(z.string().min(1).meta({
    title: "Wi-Fi network",
    description: "The network's name (SSID) as the console shows it, e.g. Guests"
  }))
})

export type WifiParams = z.infer<typeof wifiParamsSchema>
