import { signalGroup, z } from "@lox-nexus/plugin-sdk"

/** A Wi-Fi network (the API's "Wifi broadcast"), by its id, or by its name for signals added before ids. */
export const wifiParamsSchema = z.object({
  network: signalGroup(z.string().min(1).meta({
    title: "Wi-Fi network",
    description: "The network's id as the catalog fills it in, so renaming the network keeps the signal; its name (SSID), e.g. Guests, works too"
  }))
})

export type WifiParams = z.infer<typeof wifiParamsSchema>
