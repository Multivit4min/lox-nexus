import { ConfigExportSchema, type ConfigExport, type ConfigImportResultDto, type LoxoneSignalInput } from "@lox-nexus/api"
import { SignalDisplays, type WireInput } from "@lox-nexus/core"
import type { Logger } from "pino"
import { z } from "zod"
import { ErrorHandler } from "../http/ErrorHandler.ts"
import { ChangeLock } from "../http/ChangeLock.ts"
import { HttpError } from "../http/HttpError.ts"
import { ConfigCheck, type ConfigDocument } from "./ConfigCheck.ts"
import type { ImportJournal } from "./ImportJournal.ts"
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
}

/** Where an import keeps its safety copy and what it locks; both optional for tests. */
export interface ConfigTransferOptions {
  lock?: ChangeLock
  /** the configuration before a running import, on disk, so a crash in the middle can be undone */
  journal?: ImportJournal
  /** carries forces and last values on Loxone topics over the import, to topics that exist after it */
  runtime?: { cleanup: Pick<TopicCleanup, "keep" | "bringBack">; exists: (topic: string) => boolean }
}

/** the consumer whose selection travels with the file */
const HISTORY = "history"

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

  constructor(private readonly services: ConfigServices, private readonly log: Logger, private readonly options: ConfigTransferOptions = {}) {
    this.lock = options.lock ?? new ChangeLock()
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
      await this.lock.hold("restoring an interrupted import", () => this.restore(left.backup, left.passwords, "nexus"))
      journal.clear()
    } catch (error) {
      // never fails the start, and never runs again by itself over later changes
      this.log.error({ err: error, keptAt: journal.setAside() }, "restoring the configuration from before an interrupted import failed")
    }
  }

  /** the current configuration; wires that can't run are included, as stored */
  export(): ConfigExport {
    const { miniservers, signals, wires } = this.services
    const exported = miniservers.list().map(ms => ({
      id: ms.id, slug: ms.slug, label: ms.label, host: ms.host, port: ms.port, listenPort: ms.listenPort,
      ...(ms.listenAddress === undefined ? {} : { listenAddress: ms.listenAddress }),
      ownId: ms.ownId, remoteId: ms.remoteId, enabled: ms.enabled, resendInterval: ms.resendInterval,
      // the DTO types dataType as a number; the schema checks it when the file is read back
      signals: signals.list(ms.id).map(({ id, packetId, direction, dataType, label, slug, lumitech, unit, decimals }) => ({
        id, packetId, direction, dataType: dataType as LoxoneSignalInput["dataType"], label, ...(slug === undefined ? {} : { slug }),
        ...(lumitech ? { lumitech } : {}), ...SignalDisplays.of({ unit, decimals })
      }))
    }))
    // a wire to a signal outside the file (a plugin's, later) could not be recreated by an import
    const ids = new Set(exported.flatMap(ms => ms.signals.map(signal => signal.id)))
    const history = this.exportSelection(new Set([...ids, ...exported.map(ms => ms.id)]))
    return {
      format: "lox-nexus/config",
      version: 1,
      exportedAt: new Date().toISOString(),
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

  /**
   * Replaces the configuration with the file's. `by` is recorded on forces released on the way.
   * It holds the change lock, so other changing API requests are refused (503) meanwhile.
   * @throws HttpError 400 for an inconsistent file; 409 for a step that failed (the previous
   * configuration was restored) or when another import is running; 500 when restoring failed too
   */
  async import(doc: ConfigDocument, by: string): Promise<ConfigImportResultDto> {
    ConfigCheck.assertConsistent(doc)
    return await this.lock.hold("a config import", async () => {
      const passwords = this.passwords()
      // parsed, so a backup that couldn't be read back fails before anything is deleted
      const backup = ConfigExportSchema.parse(this.export())
      this.options.journal?.write({ backup, passwords })
      const kept = this.options.runtime?.cleanup.keep("loxone/#")
      try {
        await this.clear(by, false)
        // a file without selections keeps the current rules on its signals; they went with the clear
        const result = await this.apply({ ...doc, selections: { history: doc.selections?.history ?? backup.selections?.history } }, passwords, false)
        this.options.journal?.clear()
        return result
      } catch (error) {
        this.log.warn({ err: error }, "import failed, restoring the previous configuration")
        // an incomplete restore throws and keeps the journal, so the next start tries again
        await this.restore(backup, passwords, by)
        this.options.journal?.clear()
        throw error
      } finally {
        if (kept) this.bringBack(kept, by)
      }
    })
  }

  // @throws HttpError 500 when not everything came back; the log says what is missing
  private async restore(backup: ConfigDocument, passwords: Map<string, string>, by: string) {
    await this.clear(by, true)
    const restored = await this.apply(backup, passwords, true)
    const expected = { miniservers: backup.miniservers.length, signals: backup.miniservers.flatMap(ms => ms.signals).length, wires: backup.wires.length }
    if (restored.miniservers === expected.miniservers && restored.signals === expected.signals && restored.wires === expected.wires) return
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

  private passwords() {
    const stored = new Map<string, string>()
    for (const { id } of this.services.miniservers.list()) {
      const password = this.services.miniservers.require(id).config.password
      if (password !== undefined) stored.set(id, password)
    }
    return stored
  }

  // removing a Miniserver also removes its signals and, through them, their wires
  private async clear(by: string, bestEffort: boolean) {
    for (const ms of this.services.miniservers.list()) {
      await this.attempt(`removing miniserver "${ms.id}"`, bestEffort, () => this.services.miniservers.remove(ms.id, by))
    }
  }

  private async apply(doc: ConfigDocument, passwords: Map<string, string>, bestEffort: boolean): Promise<ConfigImportResultDto> {
    const { miniservers, signals, wires } = this.services
    const result: ConfigImportResultDto = { miniservers: 0, signals: 0, wires: 0, inactiveWires: 0, keptPasswords: [] }
    for (const [i, { id, signals: list, ...input }] of doc.miniservers.entries()) {
      const password = passwords.get(id)
      const created = await this.attempt(`miniservers[${i}]`, bestEffort, () => miniservers.create({ ...input, ...(password ? { password } : {}) }, id))
      if (!created) continue
      result.miniservers++
      if (password) result.keptPasswords.push(id)
      for (const [j, { id: signalId, ...signal }] of list.entries()) {
        if (await this.attempt(`miniservers[${i}].signals[${j}]`, bestEffort, () => signals.add(id, signal, signalId))) result.signals++
      }
    }
    const history = doc.selections?.history
    if (history) await this.importSelection(doc, history, bestEffort)
    for (const [i, wire] of doc.wires.entries()) {
      // transforms are only loosely typed by the file's schema; one the engine refuses is stored as inactive
      let active = true
      if (!await this.attempt(`wires[${i}]`, bestEffort, () => (active = wires.restore(wire as Required<WireInput>)))) continue
      result.wires++
      if (!active) result.inactiveWires++
    }
    return result
  }

  // only rules on what the file contains; plugin instances aren't exported
  private exportSelection(ids: Set<string>): NonNullable<ConfigExport["selections"]>["history"] {
    const selection = this.services.selections?.of(HISTORY)
    if (!selection) return undefined
    type Rule = NonNullable<NonNullable<ConfigExport["selections"]>["history"]>["rules"][number]
    const rules = selection.rules.flatMap(({ target, include }): Rule[] => {
      if ("signalId" in target && ids.has(target.signalId)) return [{ target: { signalId: target.signalId }, include }]
      if ("miniserverId" in target && ids.has(target.miniserverId)) return [{ target: { miniserverId: target.miniserverId }, include }]
      return []
    })
    return { mode: selection.mode, rules }
  }

  // the rules went with the removed signals; rules on ids the file doesn't have are skipped. While
  // restoring, one at a time: a signal that didn't come back must not cost the others' rules.
  private async importSelection(doc: ConfigDocument, history: NonNullable<NonNullable<ConfigDocument["selections"]>["history"]>, bestEffort: boolean) {
    const selections = this.services.selections
    if (!selections) return
    const ids = new Set(doc.miniservers.flatMap(ms => [ms.id, ...ms.signals.map(signal => signal.id)]))
    const known = history.rules.filter(({ target }) => ids.has("signalId" in target ? target.signalId : target.miniserverId))
    await this.attempt("selections.history", bestEffort, () => selections.setMode(HISTORY, history.mode))
    const batches = bestEffort ? known.map(rule => [rule]) : [known]
    for (const batch of batches) if (batch.length > 0) await this.attempt("selections.history", bestEffort, () => selections.setRules(HISTORY, batch))
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
