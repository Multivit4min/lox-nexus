import yauzl from "yauzl"
import { InstallError } from "./InstallError.ts"
import type { ZipEntryPolicy } from "./ZipEntryPolicy.ts"

/**
 * An uploaded ZIP, read from memory; the only class that touches yauzl. Opening lists every entry
 * through the policy, so an archive with one bad entry is refused before anything is extracted.
 */
export class ZipArchive {
  private constructor(private readonly zip: yauzl.ZipFile, private readonly entries: Map<string, yauzl.Entry>) {}

  /** @throws InstallError invalid-package for a broken archive or an entry the policy refuses */
  static async open(data: Buffer, policy: ZipEntryPolicy) {
    let zip: yauzl.ZipFile
    try {
      // strictFileNames: a backslash is an error rather than silently becoming a slash
      zip = await yauzl.fromBufferPromise(data, { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: true, strictFileNames: true })
    } catch (error) {
      throw ZipArchive.invalid(error)
    }
    try {
      return new ZipArchive(zip, await ZipArchive.list(zip, policy))
    } catch (error) {
      zip.close()
      throw error
    }
  }

  /** every file and folder name, folders ending in "/" */
  names() {
    return [...this.entries.keys()]
  }

  has(name: string) {
    return this.entries.has(name)
  }

  /**
   * Reads one entry into memory, counting bytes, so an entry larger than it declares can't get
   * past the cap (yauzl also fails on that with validateEntrySizes).
   * @throws InstallError invalid-package when it is bigger than `maxBytes` or can't be inflated
   */
  async read(name: string, maxBytes: number) {
    const entry = this.entries.get(name)
    if (!entry) throw new InstallError("invalid-package", `"${name}" is not in the archive`)
    if (entry.uncompressedSize > maxBytes) throw ZipArchive.tooLarge(name, maxBytes)
    const chunks: Buffer[] = []
    let total = 0
    try {
      const stream = await this.zip.openReadStreamPromise(entry)
      for await (const chunk of stream) {
        total += (chunk as Buffer).length
        if (total > maxBytes) {
          stream.destroy()
          throw ZipArchive.tooLarge(name, maxBytes)
        }
        chunks.push(chunk as Buffer)
      }
    } catch (error) {
      throw error instanceof InstallError ? error : ZipArchive.invalid(error)
    }
    return Buffer.concat(chunks)
  }

  close() {
    this.zip.close()
  }

  private static list(zip: yauzl.ZipFile, policy: ZipEntryPolicy) {
    return new Promise<Map<string, yauzl.Entry>>((resolve, reject) => {
      const entries = new Map<string, yauzl.Entry>()
      zip.on("entry", (entry: yauzl.Entry) => {
        try {
          policy.check(entry)
        } catch (error) {
          reject(error)
          return
        }
        entries.set(entry.fileName, entry)
        zip.readEntry()
      })
      zip.on("end", () => resolve(entries))
      zip.on("error", (error: unknown) => reject(ZipArchive.invalid(error)))
      zip.readEntry()
    })
  }

  private static tooLarge(name: string, maxBytes: number) {
    return new InstallError("invalid-package", `"${name}" is larger than ${Math.round(maxBytes / 1024)} KiB`)
  }

  // yauzl's messages name the problem (e.g. "absolute path: /x") and nothing of the server
  private static invalid(error: unknown) {
    return new InstallError("invalid-package", `not a usable ZIP archive: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`)
  }
}
