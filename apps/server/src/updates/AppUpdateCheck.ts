import { VersionChange, type AppUpdateDto } from "@lox-nexus/api"
import type { Clock } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import { z } from "zod"
import type { SettingsRepository } from "../db/repositories/SettingsRepository.ts"
import { HttpError } from "../http/HttpError.ts"
import { ChangelogSections } from "./ChangelogSections.ts"
import type { ReleaseFeed } from "./ReleaseFeed.ts"

// what the last check found, kept in the settings so a restart neither forgets it nor asks again
const StoredSchema = z.object({
  enabled: z.boolean().default(true),
  checkedAt: z.number().optional(),
  answeredAt: z.number().optional(),
  available: z.object({ version: z.string(), url: z.string(), filesUrl: z.string(), publishedAt: z.number().optional() }).optional(),
  changes: z.array(z.object({ version: z.string(), date: z.string().optional(), markdown: z.string() })).default([]),
  error: z.string().optional()
})
type Stored = z.infer<typeof StoredSchema>

/**
 * Asks GitHub whether a newer Nexus is out: shortly after the start and then once a day while
 * switched on (an hour after a failed check), and whenever someone presses Check now. It only
 * reads; updating stays with the person running Nexus (pulling the image, or the checkout).
 */
export class AppUpdateCheck extends Disposable {
  static readonly KEY = "appUpdate"
  static readonly DAY_MS = 86_400_000
  /** not at the very start: the network (and a container's DNS) may still be coming up */
  static readonly FIRST_MS = 60_000
  /** a check that failed (no DNS yet, GitHub down) is tried again sooner than a day */
  static readonly RETRY_MS = 3_600_000
  /** Check now within this long after an answer gets that answer: GitHub allows 60 asks an hour per address */
  static readonly COOLDOWN_MS = 60_000
  private running: Promise<AppUpdateDto> | undefined
  private readonly abort = new AbortController()

  constructor(
    private readonly feed: Pick<ReleaseFeed, "latest" | "changelog">,
    private readonly settings: Pick<SettingsRepository, "get" | "set">,
    private readonly current: string,
    private readonly options: { allowed: boolean; clock: Clock; log: Pick<Logger, "info" | "warn"> }
  ) {
    super()
    // a check still waiting for GitHub at shutdown gives up instead of writing to a closed database
    this.onDispose(() => this.abort.abort())
  }

  start() {
    if (!this.options.allowed) return
    const { checkedAt, error } = this.stored()
    const period = error ? AppUpdateCheck.RETRY_MS : AppUpdateCheck.DAY_MS
    const since = this.options.clock.now() - (checkedAt ?? 0)
    // a restart soon after a check doesn't ask again; a clock set back counts as the time gone
    const wait = since >= 0 && since < period ? period - since : 0
    this.after(Math.max(AppUpdateCheck.FIRST_MS, wait), () => void this.tick())
  }

  dto(): AppUpdateDto {
    const { enabled, checkedAt, answeredAt, available, changes, error } = this.stored()
    // the stored answer may be from before an update of Nexus itself, or from before checks were forbidden
    const newer = this.options.allowed && available && VersionChange.compare(available.version, this.current) > 0 ? available : undefined
    return {
      current: this.current, enabled, disabledByServer: !this.options.allowed,
      ...(checkedAt === undefined ? {} : { checkedAt }), ...(answeredAt === undefined ? {} : { answeredAt }), ...(newer ? { available: newer } : {}),
      changes: newer ? changes.filter(change => VersionChange.compare(change.version, this.current) > 0) : [],
      ...(error ? { error } : {})
    }
  }

  setEnabled(enabled: boolean) {
    this.save({ ...this.stored(), enabled })
    return this.dto()
  }

  /** @throws HttpError 409 while NEXUS_UPDATE_CHECK=false */
  check(): Promise<AppUpdateDto> {
    if (!this.options.allowed) throw HttpError.conflict("update checks are switched off on the server (NEXUS_UPDATE_CHECK=false)")
    const { answeredAt } = this.stored()
    if (!this.running && answeredAt !== undefined && Math.abs(this.options.clock.now() - answeredAt) < AppUpdateCheck.COOLDOWN_MS) return Promise.resolve(this.dto())
    this.running ??= this.ask().finally(() => (this.running = undefined))
    return this.running
  }

  // the next one a day on, or an hour on after a failure
  private async tick() {
    if (this.stored().enabled) await this.check().catch(error => this.options.log.warn(`update check failed: ${error instanceof Error ? error.message : String(error)}`))
    if (!this.isDisposed) this.after(this.stored().error ? AppUpdateCheck.RETRY_MS : AppUpdateCheck.DAY_MS, () => void this.tick())
  }

  // a failed check keeps what the last good one found, with the reason next to it
  private async ask() {
    const signal = this.abort.signal
    let found: Pick<Stored, "available" | "changes">
    try {
      const latest = await this.feed.latest(signal)
      const newer = latest && VersionChange.compare(latest.version, this.current) > 0 ? latest : undefined
      const changes = newer ? ChangelogSections.between(ChangelogSections.parse(await this.feed.changelog(newer, signal)), this.current, newer.version) : []
      if (newer && this.stored().available?.version !== newer.version) this.options.log.info(`Nexus ${newer.version} is available (running ${this.current})`)
      found = { changes, ...(newer ? { available: { version: newer.version, url: newer.url, filesUrl: newer.filesUrl, ...(newer.publishedAt ? { publishedAt: newer.publishedAt } : {}) } } : {}) }
    } catch (error) {
      if (this.isDisposed) throw new Error("Nexus is stopping", { cause: error })
      const message = error instanceof Error ? error.message : String(error)
      this.options.log.warn(`update check failed: ${message}`)
      // read again: the switch may have changed while GitHub was being asked
      this.save({ ...this.stored(), checkedAt: this.options.clock.now(), error: message })
      return this.dto()
    }
    if (this.isDisposed) throw new Error("Nexus is stopping")
    const now = this.options.clock.now()
    this.save({ enabled: this.stored().enabled, checkedAt: now, answeredAt: now, ...found })
    return this.dto()
  }

  private stored(): Stored {
    const parsed = StoredSchema.safeParse(this.settings.get(AppUpdateCheck.KEY) ?? {})
    return parsed.success ? parsed.data : StoredSchema.parse({})
  }

  private save(stored: Stored) {
    this.settings.set(AppUpdateCheck.KEY, stored)
  }
}
