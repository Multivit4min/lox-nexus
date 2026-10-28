import { randomUUID } from "node:crypto"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { StagedPackage } from "./PackageInspector.ts"
import type { StagingArea } from "./StagingArea.ts"

/** A checked install waiting for the user's confirmation. */
export interface PendingInstall {
  stagingId: string
  /** the attempt's staging folder; removed when the install is discarded or expires */
  stagingDir: string
  staged: StagedPackage
  /** epoch ms */
  expiresAt: number
  stagedBy: string
}

/**
 * At most one install waits for confirmation at a time: staging another discards it, and it
 * expires on its own, so abandoned reviews don't fill the disk.
 */
export class PendingInstalls extends Disposable {
  private current: { install: PendingInstall; cancel: () => void } | undefined

  constructor(private readonly staging: Pick<StagingArea, "remove">, private readonly ttlMs: number) {
    super()
    this.onDispose(async () => {
      await this.discard()
    })
  }

  /** replaces whatever was pending */
  async put(stagingDir: string, staged: StagedPackage, stagedBy: string): Promise<PendingInstall> {
    await this.discard()
    const install: PendingInstall = { stagingId: randomUUID(), stagingDir, staged, expiresAt: Date.now() + this.ttlMs, stagedBy }
    const cancel = this.after(this.ttlMs, () => void this.discard(install.stagingId))
    this.current = { install, cancel }
    return install
  }

  /** undefined when unknown or expired */
  get(stagingId: string) {
    return this.current?.install.stagingId === stagingId ? this.current.install : undefined
  }

  /** hands the install over to the caller, who then owns its staging folder */
  take(stagingId: string) {
    const install = this.get(stagingId)
    if (!install) return undefined
    this.current?.cancel()
    this.current = undefined
    return install
  }

  /**
   * Removes the pending install (only if it is `stagingId`, when given) with its files.
   * @returns whether something was discarded
   */
  async discard(stagingId?: string) {
    const current = this.current
    if (!current || (stagingId !== undefined && current.install.stagingId !== stagingId)) return false
    current.cancel()
    this.current = undefined
    await this.staging.remove(current.install.stagingDir)
    return true
  }
}
