import { ConfigExportSchema, type ConfigExport, type ConfigImportResultDto, type LoxoneSignalInput } from "@lox-nexus/api"
import type { WireInput } from "@lox-nexus/core"
import type { Logger } from "pino"
import { z } from "zod"
import { ErrorHandler } from "../http/ErrorHandler.ts"
import { HttpError } from "../http/HttpError.ts"
import { ConfigCheck, type ConfigDocument } from "./ConfigCheck.ts"
import type { LoxoneSignalService } from "./LoxoneSignalService.ts"
import type { MiniserverService } from "./MiniserverService.ts"
import type { WireService } from "./WireService.ts"

/** What an import needs from the services; narrow so it can be tested with fakes. */
export interface ConfigServices {
  miniservers: Pick<MiniserverService, "list" | "require" | "create" | "remove">
  signals: Pick<LoxoneSignalService, "list" | "add">
  wires: Pick<WireService, "list" | "restore">
}

/**
 * Export and import of the whole configuration: Miniservers, their signals and the wires
 * between them.
 *
 * An import replaces everything through the same services the API uses, so every rule applies.
 * Runtime and database can't share one transaction, so it takes an export first and, if any
 * step fails, clears again and restores that export. Passwords are never exported; a Miniserver
 * keeps the password stored for its id before the import. Forces and last values on Loxone
 * topics are dropped by the import, also when it is rolled back.
 */
export class ConfigTransfer {
  private importing = false

  constructor(private readonly services: ConfigServices, private readonly log: Logger) {}

  /** the current configuration; wires that can't run are included, as stored */
  export(): ConfigExport {
    const { miniservers, signals, wires } = this.services
    const exported = miniservers.list().map(ms => ({
      id: ms.id, slug: ms.slug, label: ms.label, host: ms.host, port: ms.port, listenPort: ms.listenPort,
      ...(ms.listenAddress === undefined ? {} : { listenAddress: ms.listenAddress }),
      ownId: ms.ownId, remoteId: ms.remoteId, enabled: ms.enabled, resendInterval: ms.resendInterval,
      // the DTO types dataType as a number; the schema checks it when the file is read back
      signals: signals.list(ms.id).map(({ id, packetId, direction, dataType, label, slug }) => ({
        id, packetId, direction, dataType: dataType as LoxoneSignalInput["dataType"], label, ...(slug === undefined ? {} : { slug })
      }))
    }))
    // a wire to a signal outside the file (a plugin's, later) could not be recreated by an import
    const ids = new Set(exported.flatMap(ms => ms.signals.map(signal => signal.id)))
    return {
      format: "lox-nexus/config",
      version: 1,
      exportedAt: new Date().toISOString(),
      miniservers: exported,
      wires: wires.list()
        .filter(wire => ids.has(wire.sourceId) && ids.has(wire.targetId))
        .map(({ id, label, sourceId, targetId, transforms, enabled, syncOnStart }) => ({ id, label, sourceId, targetId, transforms, enabled, syncOnStart }))
    }
  }

  /**
   * Replaces the configuration with the file's. `by` is recorded on forces released on the way.
   * Other API changes made while it runs are not blocked and may be lost.
   * @throws HttpError 400 for an inconsistent file; 409 for a step that failed (the previous
   * configuration was restored) or when another import is running; 500 when restoring failed too
   */
  async import(doc: ConfigDocument, by: string): Promise<ConfigImportResultDto> {
    if (this.importing) throw HttpError.conflict("another import is running")
    ConfigCheck.assertConsistent(doc)
    this.importing = true
    try {
      const passwords = this.passwords()
      // parsed, so a backup that couldn't be read back fails before anything is deleted
      const backup = ConfigExportSchema.parse(this.export())
      try {
        await this.clear(by, false)
        return await this.apply(doc, passwords, false)
      } catch (error) {
        this.log.warn({ err: error }, "import failed, restoring the previous configuration")
        await this.restore(backup, passwords, by)
        throw error
      }
    } finally {
      this.importing = false
    }
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
    for (const [i, wire] of doc.wires.entries()) {
      // transforms are only loosely typed by the file's schema; one the engine refuses is stored as inactive
      let active = true
      if (!await this.attempt(`wires[${i}]`, bestEffort, () => (active = wires.restore(wire as Required<WireInput>)))) continue
      result.wires++
      if (!active) result.inactiveWires++
    }
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
