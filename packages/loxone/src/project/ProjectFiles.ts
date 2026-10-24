import { unzipSync } from "fflate"
import { LoxCcDecoder } from "./LoxCcDecoder.ts"
import { ProjectReadError } from "./ProjectReadError.ts"

/** `sps_<config version>_<yyyymmddhhmmss>.zip`; older firmware may store a bare `.LoxCC` */
const PROJECT_FILE = /^sps_(\d+)(?:_(\d{14}))?\.(zip|loxcc)$/i
/** the project inside a Miniserver's archive; the archive also holds an Emergency.LoxCC */
const ENTRY = "sps0.LoxCC"
/** "PK\x03\x04", the start of a zip's first entry */
const ZIP_MAGIC = 0x04034b50
/** a Miniserver archive holds a handful of files; far more records means a crafted archive */
const MAX_ENTRIES = 1000

/** The project files a Miniserver keeps in `/prog`: which one is current, and its XML. */
export class ProjectFiles {
  /** the newest project file by its save time (then config version), or undefined when there is none */
  static newest(names: string[]): string | undefined {
    const key = (name: string) => {
      const match = PROJECT_FILE.exec(name)!
      return `${match[2] ?? "00000000000000"}-${match[1]!.padStart(6, "0")}`
    }
    return names.filter(name => PROJECT_FILE.test(name)).sort((a, b) => key(a).localeCompare(key(b))).at(-1)
  }

  /**
   * The project XML of a downloaded file: a zip holding `sps0.LoxCC`, or a `.LoxCC` itself.
   * @throws ProjectReadError for a zip without the project, a corrupt file, or an unknown name
   */
  static xml(name: string, data: Uint8Array): string {
    const extension = PROJECT_FILE.exec(name)?.[3]?.toLowerCase()
    if (!extension) throw new ProjectReadError(`"${name}" is not a project file`)
    return ProjectFiles.decode(name, extension === "zip", data)
  }

  /**
   * The project XML of a file the user picked, told apart by its content rather than its name: a
   * project saved by Loxone Config (`.Loxone`, plain XML), a Miniserver archive (`sps_….zip`) or
   * a `.LoxCC`.
   * @throws ProjectReadError for anything else, or a corrupt file
   */
  static fromFile(name: string, data: Uint8Array): string {
    const head = Buffer.from(data.subarray(0, 4))
    const magic = head.length === 4 ? head.readUInt32LE(0) : undefined
    if (magic === ZIP_MAGIC || magic === LoxCcDecoder.MAGIC) return ProjectFiles.decode(name, magic === ZIP_MAGIC, data)
    if ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff)) {
      throw new ProjectReadError(`"${name}" is UTF-16; Loxone Config saves projects as UTF-8, save it again from there`)
    }
    // TextDecoder drops a UTF-8 BOM; whitespace before the XML declaration would fail in the parser
    const text = new TextDecoder("utf-8").decode(data).trimStart()
    if (text.startsWith("<")) return text
    throw new ProjectReadError(`"${name}" is not a Loxone Config project (.Loxone), a Miniserver archive (sps_….zip) or a .LoxCC file`)
  }

  private static decode(name: string, zipped: boolean, data: Uint8Array): string {
    try {
      const loxcc = zipped ? ProjectFiles.entry(data) : data
      return new TextDecoder("utf-8").decode(LoxCcDecoder.decode(loxcc))
    } catch (error) {
      if (error instanceof ProjectReadError) throw error
      throw new ProjectReadError(`"${name}" can't be read: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Only the project entry is inflated, only once, and only if its declared size is plausible:
  // fflate inflates every accepted record, so a crafted archive repeating one 64 MB entry in its
  // directory thousands of times would otherwise block the server for hours.
  private static entry(zip: Uint8Array): Uint8Array {
    let declared = 0
    let records = 0
    let found = 0
    const files = unzipSync(zip, {
      filter: file => {
        if (++records > MAX_ENTRIES) throw new ProjectReadError(`the archive has more than ${MAX_ENTRIES} files`)
        if (file.name !== ENTRY) return false
        if (++found > 1) throw new ProjectReadError(`the archive has more than one ${ENTRY}`)
        declared = file.originalSize
        return declared <= LoxCcDecoder.MAX_OUTPUT_BYTES
      }
    })
    const entry = files[ENTRY]
    if (declared > LoxCcDecoder.MAX_OUTPUT_BYTES) throw new ProjectReadError(`the archive's ${ENTRY} is ${declared} bytes, more than allowed`)
    if (!entry) throw new ProjectReadError(`the archive has no ${ENTRY}`)
    return entry
  }
}
