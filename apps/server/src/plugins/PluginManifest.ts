import { z } from "zod"

/** the plugin API this Nexus implements; a manifest asking for another one is refused */
export const PLUGIN_API_VERSION = 1

/** The parts of a plugin's package.json that Nexus reads. */
export const PluginManifestSchema = z.object({
  version: z.string().default("0.0.0"),
  loxNexus: z.object({
    apiVersion: z.literal(PLUGIN_API_VERSION),
    /** topic segment and stable reference, e.g. "fronius"; "loxone" and "system" belong to Nexus */
    id: z.string().max(64).regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase letters, digits, '.', '_' or '-'")
      .refine(id => !["loxone", "system"].includes(id), "loxone and system are reserved topic roots"),
    name: z.string().min(1).max(100),
    /** the built bundle, relative to the package; development runs src/index.ts instead */
    entry: z.string().min(1),
    icon: z.string().max(50).regex(/^[a-z0-9-]+$/, "lowercase letters, digits or '-'").optional()
  })
})
export type PluginManifest = z.infer<typeof PluginManifestSchema>
