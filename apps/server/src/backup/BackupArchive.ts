import { once } from "node:events"
import { createReadStream, createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { finished } from "node:stream/promises"
import { z } from "zod"

const HeaderSchema = z.object({ path: z.string().min(1).max(1000), size: z.int().nonnegative() })
type Writer = ReturnType<typeof createWriteStream>

/** One file of a backup: where it goes (relative, "/"-separated) and where it is read from. */
export interface ArchiveEntry {
  path: string
  file: string
}

/**
 * The container inside a backup: per file a JSON header line ({"path","size"}) and its bytes.
 * Plain, streamable both ways, no dependency. Reading refuses paths outside the target folder
 * and anything `allowed` says no to, so a crafted file can't write elsewhere.
 */
export class BackupArchive {
  private static readonly MAX_HEADER = 4096

  /** the bytes of an archive of these files, produced while they are read */
  static async *write(entries: readonly ArchiveEntry[]): AsyncGenerator<Buffer> {
    for (const entry of entries) {
      const { size } = await fs.stat(entry.file)
      yield Buffer.from(`${JSON.stringify({ path: entry.path, size })}\n`)
      let read = 0
      for await (const chunk of createReadStream(entry.file)) {
        read += (chunk as Buffer).length
        yield chunk as Buffer
      }
      if (read !== size) throw new Error(`${entry.path} changed while it was read`)
    }
  }

  /**
   * Writes the archive's files below `dir`, at most `maxBytes` in total (the disk the data
   * directory is on must not run full). A write error fails the extract, it never escapes.
   * @returns their relative paths
   */
  static async extract(source: AsyncIterable<Buffer>, dir: string, allowed: (relative: string) => boolean, maxBytes = Number.MAX_SAFE_INTEGER): Promise<string[]> {
    const paths: string[] = []
    let pending: Buffer = Buffer.alloc(0)
    let current: { stream: Writer; left: number } | undefined
    let total = 0
    try {
      for await (const chunk of source) {
        pending = pending.length ? Buffer.concat([pending, chunk]) : chunk
        while (pending.length > 0) {
          if (current) {
            const part = pending.subarray(0, current.left)
            pending = pending.subarray(part.length)
            current.left -= part.length
            if (!current.stream.write(part)) await once(current.stream, "drain")
            if (current.left === 0) current = await BackupArchive.close(current.stream)
            continue
          }
          const newline = pending.indexOf(10)
          if (newline < 0) {
            if (pending.length > BackupArchive.MAX_HEADER) throw new Error("damaged backup: a header is too long")
            break
          }
          const header = BackupArchive.header(pending.subarray(0, newline), allowed)
          pending = pending.subarray(newline + 1)
          if ((total += header.size) > maxBytes) throw new Error("the backup doesn't fit on the disk of the data directory")
          paths.push(header.path)
          current = await BackupArchive.open(path.join(dir, ...header.path.split("/")), header.size)
        }
      }
      if (current || pending.length > 0) throw new Error("damaged backup: it ends in the middle of a file")
      return paths
    } finally {
      current?.stream.destroy()
    }
  }

  // listens for errors at once: one between writes would otherwise be an unhandled 'error' event
  private static async open(target: string, size: number) {
    await fs.mkdir(path.dirname(target), { recursive: true })
    const stream = createWriteStream(target, { mode: 0o600 })
    stream.on("error", () => {})
    return size === 0 ? await BackupArchive.close(stream) : { stream, left: size }
  }

  private static async close(stream: Writer) {
    stream.end()
    await finished(stream)
    return undefined
  }

  private static header(line: Buffer, allowed: (relative: string) => boolean) {
    let parsed: z.infer<typeof HeaderSchema>
    try {
      parsed = HeaderSchema.parse(JSON.parse(line.toString("utf8")))
    } catch {
      throw new Error("damaged backup: a header can't be read")
    }
    const relative = parsed.path
    const parts = relative.split("/")
    if (relative.startsWith("/") || parts.some(part => part === "" || part === "." || part === "..") || relative.includes("\\") || relative.includes("\0")) {
      throw new Error(`damaged backup: the path "${relative.slice(0, 100)}" is not allowed`)
    }
    if (!allowed(relative)) throw new Error(`damaged backup: "${relative.slice(0, 100)}" doesn't belong in a backup`)
    return parsed
  }
}
