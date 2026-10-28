import type { PluginSourceDto } from "@lox-nexus/api"

/** Readable texts for where an installed version came from. */
export class PluginSourceText {
  /** one line for a card, e.g. "git github.com/owner/plugin @ v1.2.0 (3f9c2e1)" */
  static short(source: PluginSourceDto) {
    switch (source.kind) {
      case "git": return `git ${PluginSourceText.host(source.url)} @ ${source.ref} (${source.commit.slice(0, 7)})`
      case "zip": return `ZIP ${source.fileName} (${source.archiveSha256.slice(0, 12)})`
      case "local": return `local folder ${source.folder}`
    }
  }

  /** the identifying detail in full, for review and copying: the commit, the archive's sha256, or the folder */
  static fingerprint(source: PluginSourceDto) {
    switch (source.kind) {
      case "git": return source.commit
      case "zip": return source.archiveSha256
      case "local": return source.folder
    }
  }

  // the URL without its scheme and a trailing .git reads better; it is shown in full on review
  private static host(url: string) {
    return url.replace(/^https?:\/\//, "").replace(/\.git$/, "")
  }
}
