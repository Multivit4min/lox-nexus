import { InstallError } from "./InstallError.ts"
import type { InstallLimits } from "./InstallLimits.ts"

/** The parts of a ZIP entry the policy looks at (yauzl's Entry has them). */
export interface ZipEntryInfo {
  fileName: string
  /** the name's bytes as stored; legacy (CP437) names decode control bytes to glyphs, so they are checked here */
  fileNameRaw?: Buffer
  externalFileAttributes: number
  generalPurposeBitFlag: number
  uncompressedSize: number
}

/**
 * Decides whether an archive is acceptable, entry by entry, before anything is extracted. Names
 * are never used as write paths (ADR 0009); refusing odd names anyway keeps the review honest
 * and an archive that needs them isn't a plugin.
 */
export class ZipEntryPolicy {
  private static readonly SYMLINK = 0o120000
  private static readonly FILE_TYPE = 0o170000
  private readonly names = new Set<string>()
  private declared = 0

  constructor(private readonly limits: InstallLimits) {}

  /** @throws InstallError invalid-package */
  check(entry: ZipEntryInfo) {
    const name = entry.fileName
    const raw = entry.fileNameRaw ? [...entry.fileNameRaw].some(byte => byte < 0x20 || byte === 0x7f) : false
    const problem = (raw ? "backslash or control character" : undefined) ?? this.nameProblem(name) ?? this.entryProblem(entry)
    if (problem) throw new InstallError("invalid-package", `the archive has an unsafe entry "${ZipEntryPolicy.printable(name)}": ${problem}`)
    this.names.add(name)
    this.declared += entry.uncompressedSize
    if (this.names.size > this.limits.entries) throw new InstallError("invalid-package", `the archive has more than ${this.limits.entries} entries`)
    if (this.declared > this.limits.unpackedBytes) throw new InstallError("invalid-package", `the archive unpacks to more than ${this.limits.unpackedBytes / 1024 / 1024} MiB`)
  }

  private nameProblem(name: string) {
    if (name.length === 0 || name.length > this.limits.nameLength) return "its name is empty or too long"
    if (name.startsWith("/") || /^[a-zA-Z]:/.test(name)) return "absolute path"
    if ([...name].some(char => char === "\\" || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) return "backslash or control character"
    if (name.split("/").includes("..")) return "parent folder (..)"
    if (this.names.has(name)) return "it appears twice"
    return undefined
  }

  // the file type sits in the upper half of the attributes when the archive was made on Unix
  private entryProblem(entry: ZipEntryInfo) {
    if (((entry.externalFileAttributes >>> 16) & ZipEntryPolicy.FILE_TYPE) === ZipEntryPolicy.SYMLINK) return "symbolic link"
    if (entry.generalPurposeBitFlag & 1) return "encrypted"
    return undefined
  }

  private static printable(name: string) {
    return [...name.slice(0, 200)].map(char => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f ? "?" : char).join("")
  }
}
