import type { InstalledPluginDto } from "@lox-nexus/api"

/** Where the install dialog starts; "Update" prefills the source the plugin came from. */
export interface InstallSource {
  kind: "git" | "zip" | "local"
  url?: string
  ref?: string
  /** a folder name of the local plugin repository */
  folder?: string
  /** an update of an installed plugin, for the dialog's title */
  update?: boolean
}

/** Builds the dialog's starting point for an update of an installed plugin. */
export class InstallSources {
  /** git: the same URL and ref; local: the folder's name; zip: an empty upload */
  static updateOf(plugin: InstalledPluginDto): InstallSource {
    const { source } = plugin.active
    if (source.kind === "git") return { kind: "git", url: source.url, ref: source.ref, update: true }
    if (source.kind === "local") return { kind: "local", folder: source.folder.split(/[\\/]/).filter(Boolean).at(-1) ?? "", update: true }
    return { kind: "zip", update: true }
  }
}
