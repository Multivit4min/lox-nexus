import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import type { Logger } from "pino"
import { InstallError } from "./InstallError.ts"

/** Temporary folders for install attempts. Whatever a crash leaves behind is wiped at the next boot. */
export class StagingArea {
  constructor(private readonly dir: string, private readonly log: Logger) {}

  /** a fresh, private folder for one attempt */
  async create() {
    const dir = path.join(this.dir, randomUUID())
    try {
      await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 })
    } catch (error) {
      throw InstallError.fromFileSystem(error)
    }
    return dir
  }

  /** best effort: a folder that can't be removed now is swept at the next boot */
  async remove(dir: string) {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch((error: unknown) => this.log.warn({ err: error, dir }, "removing a staged install failed"))
  }

  /** at boot, before anything is staged */
  async sweep() {
    await this.remove(this.dir)
  }
}
