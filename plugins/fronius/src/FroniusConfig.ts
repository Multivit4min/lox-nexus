import { z } from "@lox-nexus/plugin-sdk"

/** Instance config. The Solar API has no authentication, so nothing here is secret. */
export const froniusConfigSchema = z.object({
  host: z.url({ protocol: /^https?$/ }).describe("Address of the inverter or Datamanager, e.g. http://192.168.1.50"),
  pollInterval: z.number().min(1).max(86_400).default(5).describe("Seconds between two polls"),
  timeout: z.number().min(1).max(60).default(5).describe("Seconds a single request may take")
})

export type FroniusConfig = z.infer<typeof froniusConfigSchema>
