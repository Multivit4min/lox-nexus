import fs from "node:fs"

/** The server's version, from its package.json; "unknown" when it can't be read (e.g. a stripped bundle). */
export class AppVersion {
  static read(): string {
    try {
      const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown }
      return typeof pkg.version === "string" ? pkg.version : "unknown"
    } catch {
      return "unknown"
    }
  }
}
