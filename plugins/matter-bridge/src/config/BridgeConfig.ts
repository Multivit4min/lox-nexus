import { z } from "@lox-nexus/plugin-sdk"

/** Matter strings such as a device's label are limited in bytes, not characters */
export const nameSchema = () => z.string().trim().min(1).max(32)
  .refine(text => Buffer.byteLength(text) <= 32, "at most 32 bytes (letters like ä or é count twice)")

/**
 * Instance config: the bridge's name and port. The devices are managed with the Add, Edit and
 * Remove device actions and kept in the plugin store. Loose, so the device list of an old config
 * survives validation until the plugin has taken it over (the form shows only these two fields).
 * The price: other keys posted with a config are kept and returned too. Replace this with the SDK's
 * planned config migrations once they exist; a save from the form before the first start of this
 * version drops the old list (the form doesn't send it), which REFERENCE warns about.
 */
export const bridgeConfigSchema = z.looseObject({
  name: nameSchema().default("Lox Nexus").meta({ title: "Bridge name", description: "How the bridge shows in Alexa, Google Home, Apple Home and Home Assistant" }),
  port: z.number().int().min(1024).max(65535).default(5540).meta({
    title: "UDP port",
    description: "The Matter port. Change it if another Matter program on this host (Home Assistant's Matter Server, Matterbridge) already uses 5540"
  })
})

export type BridgeConfig = z.infer<typeof bridgeConfigSchema>
