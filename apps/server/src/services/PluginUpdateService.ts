import { randomUUID } from "node:crypto"
import { VersionChange, type BatchOutcomeDto, type BatchReviewDto, type BatchReviewItemDto, type InstalledPluginDto, type PluginUpdateDto, type PluginUpdatesDto } from "@lox-nexus/api"
import type { Logger } from "pino"
import type { GitRemote } from "../plugins/install/GitRemote.ts"
import { InstallError } from "../plugins/install/InstallError.ts"
import type { PluginPackageService } from "./PluginPackageService.ts"

/** What the update service works with; built by PluginAssembly. */
export interface PluginUpdateDeps {
  packages: Pick<PluginPackageService, "list" | "repository" | "describeLocal" | "updateLocal">
  git: Pick<GitRemote, "commit">
  log: Logger
  now?: () => number
  /** how long a batch review stays confirmable; default 15 minutes, like a staged install */
  batchMs?: number
}

/** One plugin of a reviewed batch, as it was checked */
interface BatchItem {
  id: string
  name: string
  folder: string
  from: string
  to: string
  bundleSha256: string
}

/** What the last git check found for one plugin, for the source it was installed from then */
interface RemoteCommit {
  url: string
  ref: string
  commit?: string
  problem?: string
}

/**
 * Which installed plugins have a newer version, and updating several plugins from the local
 * repository in one go. A batch review describes each plugin (to show what changes for its
 * instances) without parking it; the confirmation stages and installs each in one locked step,
 * only if it is still exactly what was reviewed. Every step goes through the package service, so
 * the installer's lock and checks apply unchanged. Git plugins are only checked when asked.
 */
export class PluginUpdateService {
  /** a few at once: each is one short request, but a slow server shouldn't hold up the rest */
  static readonly GIT_CONCURRENCY = 4

  private readonly remoteCommits = new Map<string, RemoteCommit>()
  private readonly batches = new Map<string, { items: BatchItem[]; expiresAt: number }>()
  private gitCheckedAt: number | undefined
  private checking: Promise<PluginUpdatesDto> | undefined
  private confirming = false

  constructor(private readonly deps: PluginUpdateDeps) {}

  updates(): PluginUpdatesDto {
    const installed = this.deps.packages.list()
    const offered = this.offered()
    const updates = installed.flatMap(plugin => this.updateOf(plugin, offered))
    const problems = installed.flatMap(plugin => {
      const problem = this.remoteOf(plugin)?.problem
      return problem ? [{ id: plugin.id, name: plugin.name, problem }] : []
    })
    return { updates, problems, ...(this.gitCheckedAt === undefined ? {} : { gitCheckedAt: this.gitCheckedAt }) }
  }

  /** asks each git plugin's server for the commit its ref points at now; one failing doesn't stop the others; a check already running is shared */
  checkGit(): Promise<PluginUpdatesDto> {
    this.checking ??= this.askRemotes().finally(() => {
      this.checking = undefined
    })
    return this.checking
  }

  /** checks every listed plugin's update from the local repository; @returns the review to confirm by its id */
  async review(ids: readonly string[], by: string): Promise<BatchReviewDto> {
    this.expire()
    const installed = new Map(this.deps.packages.list().map(plugin => [plugin.id, plugin]))
    const offered = this.offered()
    const items: BatchReviewItemDto[] = []
    const accepted: BatchItem[] = []
    for (const id of new Set(ids)) {
      const plugin = installed.get(id)
      const item: BatchReviewItemDto = { id, name: plugin?.name ?? id, from: plugin?.active.version ?? "" }
      try {
        const checked = await this.check(plugin, offered, by)
        accepted.push(checked.item)
        items.push({ ...item, to: checked.item.to, ...(checked.impact ? { impact: checked.impact } : {}) })
      } catch (error) {
        // another install running is no reason against a plugin; the whole review waits for it
        if (error instanceof InstallError && error.reason === "busy") throw error
        items.push({ ...item, problem: PluginUpdateService.message(error) })
      }
    }
    const expiresAt = this.now() + (this.deps.batchMs ?? 15 * 60_000)
    if (accepted.length === 0) return { expiresAt, items }
    const batchId = randomUUID()
    this.batches.set(batchId, { items: accepted, expiresAt })
    return { batchId, expiresAt, items }
  }

  /**
   * Installs each reviewed plugin, one after another; a plugin that changed since the review, or
   * fails, is reported and the others go on.
   * @throws InstallError not-found when the review expired or was confirmed already, busy while another batch installs
   */
  async confirm(batchId: string, by: string): Promise<BatchOutcomeDto> {
    this.expire()
    if (this.confirming) throw new InstallError("busy", "other plugin updates are being installed; try again when they are done")
    const batch = this.batches.get(batchId)
    if (!batch) throw new InstallError("not-found", "the review expired or was already confirmed; check the updates again")
    this.batches.delete(batchId)
    this.confirming = true
    try {
      const items: BatchOutcomeDto["items"] = []
      for (const item of batch.items) items.push(await this.install(item, by))
      this.deps.log.info({ by, results: items.map(item => `${item.id}: ${item.ok ? item.version : item.error}`) }, "plugin batch update")
      return { items }
    } finally {
      this.confirming = false
    }
  }

  private async check(plugin: InstalledPluginDto | undefined, offered: ReadonlyMap<string, { folder: string; version: string }>, by: string) {
    if (!plugin) throw new InstallError("not-found", "not installed")
    if (plugin.active.source.kind !== "local") throw new InstallError("conflict", "installed from git or a ZIP file; update it on its card")
    const candidate = offered.get(plugin.id)
    if (!candidate || !PluginUpdateService.isNewer(candidate.version, plugin.active.version)) throw new InstallError("conflict", "the local repository has no newer version")
    const described = await this.deps.packages.describeLocal(candidate.folder, by)
    const item: BatchItem = { id: plugin.id, name: plugin.name, folder: candidate.folder, from: plugin.active.version, to: described.version, bundleSha256: described.bundleSha256 }
    return { item, impact: described.impact }
  }

  private async install(item: BatchItem, by: string): Promise<BatchOutcomeDto["items"][number]> {
    try {
      const outcome = await this.deps.packages.updateLocal(item.folder, { version: item.to, bundleSha256: item.bundleSha256 }, item.from, by)
      return { id: item.id, name: item.name, ok: true, version: outcome.plugin.active.version }
    } catch (error) {
      return { id: item.id, name: item.name, ok: false, error: PluginUpdateService.message(error) }
    }
  }

  private async askRemotes() {
    const plugins = this.deps.packages.list()
    const installed = new Set(plugins.map(plugin => plugin.id))
    for (const id of this.remoteCommits.keys()) if (!installed.has(id)) this.remoteCommits.delete(id)
    const queue = plugins.flatMap(plugin => (plugin.active.source.kind === "git" ? [{ id: plugin.id, ...plugin.active.source }] : []))
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { id, url, ref } = next
        const found = await this.deps.git.commit(url, ref).then(commit => ({ commit }), (error: unknown) => ({ problem: PluginUpdateService.message(error) }))
        this.remoteCommits.set(id, { url, ref, ...found })
      }
    }
    await Promise.all(Array.from({ length: PluginUpdateService.GIT_CONCURRENCY }, worker))
    this.gitCheckedAt = this.now()
    return this.updates()
  }

  // a result only counts for the source it was asked for: a reinstall from elsewhere starts over
  private remoteOf(plugin: InstalledPluginDto) {
    const source = plugin.active.source
    const remote = this.remoteCommits.get(plugin.id)
    return source.kind === "git" && remote?.url === source.url && remote.ref === source.ref ? remote : undefined
  }

  private updateOf(plugin: InstalledPluginDto, offered: ReadonlyMap<string, { version: string }>): PluginUpdateDto[] {
    const source = plugin.active.source
    const base = { id: plugin.id, name: plugin.name, installedVersion: plugin.active.version }
    if (source.kind === "local") {
      const candidate = offered.get(plugin.id)
      return candidate && PluginUpdateService.isNewer(candidate.version, plugin.active.version) ? [{ ...base, source: "local", available: candidate.version }] : []
    }
    const commit = this.remoteOf(plugin)?.commit
    return source.kind === "git" && commit && commit !== source.commit ? [{ ...base, source: "git", available: commit }] : []
  }

  /** the installable plugins of the local repository, by plugin id */
  private offered() {
    const entries = this.deps.packages.repository().flatMap(entry => (entry.id && entry.version && !entry.problem ? [[entry.id, { folder: entry.folder, version: entry.version }] as const] : []))
    return new Map(entries)
  }

  private expire() {
    for (const [id, batch] of this.batches) if (batch.expiresAt <= this.now()) this.batches.delete(id)
  }

  private now() {
    return this.deps.now?.() ?? Date.now()
  }

  // a rebuild (same version, other build stamp) counts: it is what a changed first-party plugin looks like
  private static isNewer(available: string, installed: string) {
    const change = VersionChange.of(available, installed)
    return change === "update" || change === "rebuild"
  }

  private static message(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 500) : String(error)
  }
}
