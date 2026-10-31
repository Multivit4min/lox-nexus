import { signalGroup, z } from "@lox-nexus/plugin-sdk"
import { MacAddress } from "../api/MacAddress.ts"

/** the fields that name a client, for schemas that add their own */
export const clientShape = {
  // signal lists group the signals of one client
  client: signalGroup(z.string().min(1).meta({
    title: "Client",
    description: "The client's MAC address, e.g. 02:00:00:00:00:01, or with \"Match by\" set to name, its name as UniFi shows it"
  })),
  matchBy: z.enum(["mac", "name"]).default("mac").meta({
    title: "Match by",
    description: "Name: for iPhones and other devices whose private Wi-Fi address rotates",
    enumLabels: { mac: "MAC address", name: "Name (ignoring case)" }
  })
}

/** a MAC address must look like one when the client is matched by MAC */
export function checkClientMac(params: { client: string; matchBy: "mac" | "name" }) {
  return params.matchBy !== "mac" || MacAddress.pattern.test(params.client)
}

export const clientMacIssue = { message: "a MAC address such as 02:00:00:00:00:01, or set \"Match by\" to name", path: ["client"] }

/** Which client a signal follows: by MAC address, or by name for phones that rotate their Wi-Fi address. */
export const clientParamsSchema = z.object(clientShape).refine(checkClientMac, clientMacIssue)

export type ClientParams = z.infer<typeof clientParamsSchema>
