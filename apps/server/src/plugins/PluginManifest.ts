import { z } from "zod"

/** the plugin API this Nexus implements; a manifest asking for another one is refused */
export const PLUGIN_API_VERSION = 1

/** The parts of a plugin's package.json that Nexus reads. */
export const PluginManifestSchema = z.object({
  version: z.string().default("0.0.0"),
  loxNexus: z.object({
    apiVersion: z.literal(PLUGIN_API_VERSION),
    /** topic segment and stable reference, e.g. "fronius" */
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase letters, digits, '.', '_' or '-'"),
    name: z.string().min(1),
    /** the built bundle, relative to the package; development runs src/index.ts instead */
    entry: z.string().min(1),
    icon: z.string().optional()
  })
})
export type PluginManifest = z.infer<typeof PluginManifestSchema>
