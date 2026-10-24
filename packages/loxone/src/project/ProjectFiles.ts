import { unzipSync } from "fflate"
import { LoxCcDecoder } from "./LoxCcDecoder.ts"
import { ProjectReadError } from "./ProjectReadError.ts"

/** `sps_<config version>_<yyyymmddhhmmss>.zip`; older firmware may store a bare `.LoxCC` */
const PROJECT_FILE = /^sps_(\d+)(?:_(\d{14}))?\.(zip|loxcc)$/i
/** the project inside a Miniserver's archive; the archive also holds an Emergency.LoxCC */
const ENTRY = "sps0.LoxCC"

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
    try {
      const loxcc = extension === "zip" ? ProjectFiles.entry(data) : data
      return new TextDecoder("utf-8").decode(LoxCcDecoder.decode(loxcc))
    } catch (error) {
      if (error instanceof ProjectReadError) throw error
      throw new ProjectReadError(`"${name}" can't be read: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // only the project entry is inflated, and only if its declared size is plausible
  private static entry(zip: Uint8Array): Uint8Array {
    let declared = 0
    const files = unzipSync(zip, {
      filter: file => {
        if (file.name !== ENTRY) return false
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
