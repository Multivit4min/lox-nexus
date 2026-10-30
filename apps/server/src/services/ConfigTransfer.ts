import { ConfigExportSchema, type ConfigExport, type ConfigImportResultDto } from "@lox-nexus/api"
import type { WireInput } from "@lox-nexus/core"
import type { Logger } from "pino"
import { z } from "zod"
import { SecretSeal } from "../backup/SecretSeal.ts"
import { ErrorHandler } from "../http/ErrorHandler.ts"
import { ChangeLock } from "../http/ChangeLock.ts"
import { HttpError } from "../http/HttpError.ts"
import { ConfigCheck, type ConfigDocument } from "./ConfigCheck.ts"
import { HistorySelectionTransfer } from "./HistorySelectionTransfer.ts"
import type { ImportJournal } from "./ImportJournal.ts"
import { PluginSecrets } from "./PluginSecrets.ts"
import { MiniserverTransfer } from "./MiniserverTransfer.ts"
import type { ByInstance, PluginSnapshot, PluginTransfer } from "./PluginTransfer.ts"
import type { LoxoneSignalService } from "./LoxoneSignalService.ts"
import type { MiniserverService } from "./MiniserverService.ts"
import type { SelectionService } from "./SelectionService.ts"
import type { KeptState, TopicCleanup } from "./TopicCleanup.ts"
import type { WireService } from "./WireService.ts"

/** What an import needs from the services; narrow so it can be tested with fakes. */
export interface ConfigServices {
  miniservers: Pick<MiniserverService, "list" | "require" | "create" | "remove">
  signals: Pick<LoxoneSignalService, "list" | "add">
  wires: Pick<WireService, "list" | "restore">
  /** absent in tests that don't cover selections */
  selections?: Pick<SelectionService, "of" | "setMode" | "setRules">
  /** the plugin instances; absent in tests that cover only Loxone */
  plugins?: PluginTransfer
}

/** Where an import keeps its safety copy and what it locks; both optional for tests. */
export interface ConfigTransferOptions {
  lock?: ChangeLock
  /** the configuration before a running import, on disk, so a crash in the middle can be undone */
  journal?: ImportJournal
  /** carries forces and last values on Loxone topics over the import, to topics that exist after it */
  runtime?: { cleanup: Pick<TopicCleanup, "keep" | "bringBack">; exists: (topic: string) => boolean }
}

/** what applying gives the plugin instances besides the file's rows: what they had, and the file's sealed secrets */
interface PluginData {
  current: PluginSnapshot
  file: ByInstance
}

/**
 * Export and import of the whole configuration: Miniservers, their signals, the wires between
 * them, and which of them the history records.
 *
 * An import replaces everything through the same services the API uses, so every rule applies.
 * Runtime and database can't share one transaction, so it takes an export first and, if any
 * step fails, clears again and restores that export. The export also goes to the journal on disk
 * until the import is over, so recover() can restore it after a crash. Passwords are never exported; a Miniserver
 * keeps the password stored for its id before the import. Forces and last values on Loxone
 * topics that exist after the import (or its rollback) are carried over; the others are released.
 */
export class ConfigTransfer {
  private readonly lock: ChangeLock
  private static readonly NO_PLUGINS: PluginSnapshot = { secrets: {}, stores: {}, plugins: {} }
  private readonly history: HistorySelectionTransfer
  private readonly loxone: MiniserverTransfer

  constructor(private readonly services: ConfigServices, private readonly log: Logger, private readonly options: ConfigTransferOptions = {}) {
    this.lock = options.lock ?? new ChangeLock()
    this.history = new HistorySelectionTransfer(services.selections)
    this.loxone = new MiniserverTransfer(services.miniservers, services.signals)
  }

  /**
   * Restores the configuration an import left in the journal when Nexus stopped in the middle of
   * it. Called at boot, after the stored configuration is loaded and before values are restored,
   * Miniservers start and the HTTP API listens. A journal that can't be read or restored is logged
   * and set aside (`import-failed-<time>.json`) for a person to look at; the start goes on.
   */
  async recover() {
    const journal = this.options.journal
    let left: ReturnType<ImportJournal["read"]>
    try {
      left = journal?.read()
    } catch (error) {
      this.log.error({ err: error, keptAt: journal?.setAside() }, "an interrupted config import left a journal that can't be read; it was not restored")
      return
    }
    if (!journal || !left) return
    this.log.warn("a config import was interrupted; restoring the configuration from before it")
    try {
      // the boot starts the plugin instances afterwards, like any other time
      await this.lock.hold("restoring an interrupted import", () => this.restore(left.backup, left.passwords, left.plugins, "nexus", false))
      journal.clear()
    } catch (error) {
      // never fails the start, and never runs again by itself over later changes
      this.log.error({ err: error, keptAt: journal.setAside() }, "restoring the configuration from before an interrupted import failed")
    }
  }

  /** the current configuration; wires that can't run are included, as stored */
  export(): ConfigExport {
    const { wires } = this.services
    const exported = this.loxone.export()
    const plugins = this.services.plugins?.export().plugins
    // a wire to a signal outside the file could not be recreated by an import
    const ids = new Set([...exported.flatMap(ms => ms.signals.map(signal => signal.id)), ...(plugins ?? []).flatMap(plugin => plugin.signals.map(signal => signal.id))])
    const history = this.history.export(new Set([...ids, ...exported.map(ms => ms.id), ...(plugins ?? []).map(plugin => plugin.id)]))
    return {
      format: "lox-nexus/config",
      version: plugins ? 2 : 1,
      exportedAt: new Date().toISOString(),
      ...(plugins ? { plugins } : {}),
      ...(history ? { selections: { history } } : {}),
      miniservers: exported,
      wires: wires.list()
        .filter(wire => ids.has(wire.sourceId) && ids.has(wire.targetId))
        .map(({ id, label, sourceId, targetId, transforms, enabled, syncOnStart }) => ({
          id, label, sourceId, targetId, enabled, syncOnStart,
          // a step this version can't run goes out as stored; the import's schema checks it
          transforms: transforms.map(step => (step.op === "unsupported" ? step.raw : step)) as ConfigExport["wires"][number]["transforms"]
        }))
    }
  }

  /** the export with the plugins' secret settings, sealed with `passphrase` */
  async exportSealed(passphrase: string): Promise<ConfigExport> {
    const doc = this.export()
    const secrets = this.services.plugins?.export().secrets ?? {}
    return { ...doc, secrets: await SecretSeal.seal(secrets, passphrase) }
  }

  /**
   * Replaces the configuration with the file's. `by` is recorded on forces released on the way.
   * A file with plugin instances replaces those too; one without them (version 1) leaves them.
   * It holds the change lock, so other changing API requests are refused (503) meanwhile.
   * @throws HttpError 400 for an inconsistent file; 409 for a step that failed (the previous
   * configuration was restored) or when another import is running; 500 when restoring failed too
   */
  async import(doc: ConfigDocument, by: string, passphrase?: string): Promise<ConfigImportResultDto> {
    const withPlugins = doc.plugins !== undefined
    // a file without plugin instances keeps them, and may wire to their signals
    ConfigCheck.assertConsistent(doc, withPlugins ? undefined : this.services.plugins?.signalIds())
    return await this.lock.hold("a config import", async () => {
      // inside the lock: one scrypt derivation at a time
      const fileSecrets = await PluginSecrets.open(doc, passphrase)
      const passwords = this.loxone.passwords()
      const plugins = withPlugins && this.services.plugins ? await this.services.plugins.snapshot() : ConfigTransfer.NO_PLUGINS
      // parsed, so a backup that couldn't be read back fails before anything is deleted; without
      // plugin instances in the file, its rollback leaves them alone too
      const { plugins: exported, ...rest } = ConfigExportSchema.parse(this.export())
      const backup = withPlugins && exported ? { ...rest, plugins: exported } : rest
      this.options.journal?.write({ backup, passwords, plugins })
      const kept = this.options.runtime?.cleanup.keep("#")
      try {
        await this.clear(by, false, withPlugins)
        // a file without selections keeps the current rules on its signals; they went with the clear
        const file = { ...doc, selections: { history: doc.selections?.history ?? backup.selections?.history } }
        const result = await this.apply(file, passwords, { current: plugins, file: fileSecrets }, false, true)
        this.options.journal?.clear()
        return result
      } catch (error) {
        this.log.warn({ err: error }, "import failed, restoring the previous configuration")
        // an incomplete restore throws and keeps the journal, so the next start tries again
        await this.restore(backup, passwords, plugins, by, true)
        this.options.journal?.clear()
        throw error
      } finally {
        if (kept) this.bringBack(kept, by)
      }
    })
  }

  // @throws HttpError 500 when not everything came back; the log says what is missing
  private async restore(backup: ConfigDocument, passwords: Map<string, string>, plugins: PluginSnapshot, by: string, start: boolean) {
    await this.clear(by, true, backup.plugins !== undefined)
    const restored = await this.apply(backup, passwords, { current: plugins, file: {} }, true, start)
    const expected = {
      miniservers: backup.miniservers.length, signals: backup.miniservers.flatMap(ms => ms.signals).length, wires: backup.wires.length,
      plugins: backup.plugins?.length ?? 0, pluginSignals: (backup.plugins ?? []).flatMap(plugin => plugin.signals).length
    }
    if ((Object.keys(expected) as Array<keyof typeof expected>).every(key => restored[key] === expected[key])) return
    this.log.error({ expected, restored }, "the previous configuration was not restored completely")
    throw new HttpError(500, "the import failed and the previous configuration could not be restored completely; see the server log")
  }

  // never fails the import: what can't come back is released, as before
  private bringBack(kept: KeptState, by: string) {
    const runtime = this.options.runtime
    try {
      runtime?.cleanup.bringBack(kept, runtime.exists, by)
    } catch (error) {
      this.log.warn({ err: error }, "forces and values from before the import could not be carried over")
    }
  }

  // the plugin instances only for a file that has them (version 2)
  private async clear(by: string, bestEffort: boolean, plugins: boolean) {
    await this.loxone.clear(by, (where, work) => this.attempt(where, bestEffort, work))
    if (plugins) await this.attempt("removing the plugin instances", bestEffort, () => this.services.plugins?.clear(by))
  }

  // `start`: plugin instances start when they are attached; not during a recovery at boot
  private async apply(doc: ConfigDocument, passwords: Map<string, string>, plugins: PluginData, bestEffort: boolean, start: boolean): Promise<ConfigImportResultDto> {
    const { wires } = this.services
    const result: ConfigImportResultDto = { miniservers: 0, signals: 0, wires: 0, inactiveWires: 0, keptPasswords: [], plugins: 0, pluginSignals: 0, missingSecrets: [] }
    const step = (where: string, work: () => unknown) => this.attempt(where, bestEffort, work)
    await this.loxone.apply(doc, passwords, step, result)
    if (doc.plugins && this.services.plugins) Object.assign(result, await this.services.plugins.apply(doc.plugins, plugins.current, plugins.file, step, start))
    const history = doc.selections?.history
    if (history) await this.history.import(doc, history, step, bestEffort)
    for (const [i, wire] of doc.wires.entries()) {
      // transforms are only loosely typed by the file's schema; one the engine refuses is stored as inactive
      let active = true
      if (!await this.attempt(`wires[${i}]`, bestEffort, () => (active = wires.restore(wire as Required<WireInput>)))) continue
      result.wires++
      if (!active) result.inactiveWires++
    }
    if (doc.plugins) await this.services.plugins?.applyWatches(doc.plugins, step, bestEffort)
    return result
  }

  // best effort (restoring) logs a failure and goes on, so as much as possible comes back
  private async attempt(where: string, bestEffort: boolean, work: () => unknown) {
    try {
      await work()
      return true
    } catch (error) {
      if (!bestEffort) throw ConfigTransfer.located(where, error)
      this.log.error({ err: error, where }, "could not restore")
      return false
    }
  }

  // names the entry of the file that failed; SQL and internals stay out of the message
  private static located(where: string, error: unknown) {
    if (error instanceof z.ZodError) return HttpError.badRequest(`${where}: ${z.prettifyError(error)}`)
    if (ErrorHandler.isConstraint(error)) return HttpError.conflict(`${where}: conflicts with other data in the file`)
    const known = HttpError.fromDomain(error)
    return known instanceof HttpError ? new HttpError(known.status, `${where}: ${known.message}`) : error
  }
}
