import fs from "node:fs"
import path from "node:path"
import type { CatalogEntry } from "./PluginCatalog.ts"
import { InstallLimits } from "./install/InstallLimits.ts"
import { PackageWriter } from "./install/PackageWriter.ts"

/**
 * A plugin's README.md as Markdown text, for the Installed page: from the folder of the version in
 * use (the installer keeps it) or of a development copy. A file that is missing, not a plain file
 * or larger than the install limit gives undefined.
 */
export class PluginReadme {
  static read(entry: Pick<CatalogEntry, "dir"> | undefined, maxBytes = new InstallLimits().readmeBytes): string | undefined {
    if (!entry?.dir) return undefined
    for (const name of PackageWriter.README_NAMES) {
      const file = path.join(entry.dir, name)
      try {
        const stat = fs.lstatSync(file)
        if (stat.isFile() && stat.size <= maxBytes) return fs.readFileSync(file, "utf8")
      } catch {
        // not there under this name
      }
    }
    return undefined
  }
}
