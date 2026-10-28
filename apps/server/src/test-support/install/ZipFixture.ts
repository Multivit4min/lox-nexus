import { strToU8, zipSync, type Zippable } from "fflate"
import { FixtureBundle } from "./FixtureBundle.ts"

/** ZIP archives for the installer tests, built in memory with fflate. */
export class ZipFixture {
  /** an archive of the given files; a Uint8Array value is stored as is, a string as UTF-8 */
  static zip(files: Record<string, string | Uint8Array | [Uint8Array, { attrs?: number; os?: number }]>) {
    const zippable: Zippable = {}
    for (const [name, content] of Object.entries(files)) {
      zippable[name] = typeof content === "string" ? strToU8(content) : content
    }
    return Buffer.from(zipSync(zippable, { level: 6 }))
  }

  /** the fixture plugin as a release ZIP, optionally inside a top-level folder */
  static async plugin(prefix = "", manifest = FixtureBundle.manifest()) {
    return ZipFixture.zip({ [`${prefix}package.json`]: manifest, [`${prefix}dist/plugin.js`]: await FixtureBundle.bundle() })
  }

  /**
   * Changes every central directory record of an archive (signature 0x02014b50), e.g. to set the
   * encrypted flag or declare a wrong size, which zip tools refuse to produce.
   */
  static patchCentral(data: Buffer, patch: (data: Buffer, record: number) => void) {
    const copy = Buffer.from(data)
    for (let offset = copy.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); offset >= 0; offset = copy.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset + 4)) {
      patch(copy, offset)
    }
    return copy
  }
}
