import { z } from "zod"
import { PluginManifestSchema } from "../PluginManifest.ts"
import { InstallError } from "./InstallError.ts"

/** What an installable package.json says about the plugin. */
export interface InstallManifest {
  id: string
  name: string
  /** strict semver; also the name of its folder */
  version: string
  /** relative POSIX path of the bundle */
  entry: string
  icon?: string
}

// semver.org's regular expression; build metadata is allowed, so "1.0.0+abc" is a valid folder name too
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/** a relative POSIX path to a .js or .mjs file that can't leave the package */
const Entry = z.string().max(512)
  .refine(entry => !entry.startsWith("/") && !entry.startsWith("./"), "must be relative without a leading / or ./")
  .refine(entry => !entry.split("/").some(segment => segment === ".." || segment === "." || segment === ""), "must not contain empty, . or .. segments")
  .refine(entry => ![...entry].some(char => char === "\\" || char.charCodeAt(0) < 0x20), "must not contain backslashes or control characters")
  .refine(entry => entry.endsWith(".js") || entry.endsWith(".mjs"), "must end in .js or .mjs")

/** the install rules on top of what development plugins need */
const InstallManifestSchema = PluginManifestSchema.extend({
  version: z.string().max(64).regex(SEMVER, "must be a semantic version such as 1.2.0"),
  type: z.string().optional(),
  loxNexus: PluginManifestSchema.shape.loxNexus.extend({ entry: Entry })
}).refine(manifest => manifest.type === "module" || manifest.loxNexus.entry.endsWith(".mjs"), {
  message: "\"type\" must be \"module\" (plugins are ES modules), or the entry must end in .mjs"
})

/** Reads and checks the package.json of a plugin that is about to be installed. */
export class ManifestValidator {
  /**
   * @param text the file's bytes, already capped by the caller
   * @throws InstallError invalid-package naming what is wrong
   */
  static parse(text: Buffer | string): InstallManifest {
    let json: unknown
    try {
      json = JSON.parse(text.toString())
    } catch {
      throw new InstallError("invalid-package", "package.json is not valid JSON")
    }
    const parsed = InstallManifestSchema.safeParse(json)
    if (!parsed.success) throw new InstallError("invalid-package", `package.json is not an installable plugin: ${z.prettifyError(parsed.error)}`)
    const { version, loxNexus: { id, name, entry, icon } } = parsed.data
    return { id, name, version, entry, ...(icon ? { icon } : {}) }
  }

  /** true when package.json declares a plugin at all (has a loxNexus block), valid or not */
  static declaresPlugin(text: Buffer | string) {
    try {
      const json: unknown = JSON.parse(text.toString())
      return typeof json === "object" && json !== null && "loxNexus" in json
    } catch {
      return false
    }
  }
}
