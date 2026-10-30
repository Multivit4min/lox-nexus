import { z } from "zod"
import { ManifestVersions } from "./ManifestVersions.ts"

/** The parts of a plugin's package.json that Nexus reads. */
export const PluginManifestSchema = z.object({
  version: z.string().default("0.0.0"),
  loxNexus: z.object({
    apiVersion: z.int().superRefine((version, context) => {
      const refusal = ManifestVersions.refusal(version)
      if (refusal) context.addIssue({ code: "custom", message: refusal })
    }),
    /** topic segment and stable reference, e.g. "fronius"; "loxone" and "system" belong to Nexus */
    id: z.string().max(64).regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase letters, digits, '.', '_' or '-'")
      .refine(id => !["loxone", "system"].includes(id), "loxone and system are reserved topic roots"),
    name: z.string().min(1).max(100),
    /** the built bundle, relative to the package; development runs src/index.ts instead */
    entry: z.string().min(1),
    icon: z.string().max(50).regex(/^[a-z0-9-]+$/, "lowercase letters, digits or '-'").optional(),
    /** the worker's heap limit in MB, for plugins that need more than the default 128 (a Matter stack) */
    heapMb: z.int().min(128).max(512).optional()
  })
})
export type PluginManifest = z.infer<typeof PluginManifestSchema>
