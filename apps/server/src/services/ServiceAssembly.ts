import type { EventBus, PluginManager, SignalRegistry, WireEngine } from "@lox-nexus/core"
import type { MiniserverManager } from "@lox-nexus/loxone"
import type { Logger } from "pino"
import type { Persistence } from "../db/Persistence.ts"
import { ChangeLock } from "../http/ChangeLock.ts"
import type { PluginAssembly } from "../plugins/PluginAssembly.ts"
import type { PluginCatalog } from "../plugins/PluginCatalog.ts"
import { ConfigTransfer } from "./ConfigTransfer.ts"
import type { ImportJournal } from "./ImportJournal.ts"
import { LoxoneSignalService } from "./LoxoneSignalService.ts"
import { MiniserverService } from "./MiniserverService.ts"
import type { PluginLogs } from "./PluginLogs.ts"
import { PluginService } from "./PluginService.ts"
import { PluginSignalService } from "./PluginSignalService.ts"
import { PluginTransfer } from "./PluginTransfer.ts"
import type { SelectionService } from "./SelectionService.ts"
import { TopicCleanup } from "./TopicCleanup.ts"
import { UnloadableRows } from "./UnloadableRows.ts"
import { WireService } from "./WireService.ts"

/** What the services are built on: NexusApp's runtime and database. */
export interface ServiceParts {
  db: Persistence
  bus: EventBus
  signals: SignalRegistry
  wires: WireEngine
  miniservers: MiniserverManager
  plugins: PluginManager
  pluginCatalog: PluginCatalog
  pluginAssembly: PluginAssembly
  pluginLogs: PluginLogs
  selections: SelectionService
  /** next to the database; none for an in-memory one */
  journal: ImportJournal | undefined
  log: Logger
}

/**
 * The services between the HTTP layer and the runtime, built by NexusApp.start() in the order
 * they depend on each other. Building them loads nothing; start() does that in its boot order.
 */
export class ServiceAssembly {
  readonly miniservers: MiniserverService
  readonly loxoneSignals: LoxoneSignalService
  readonly wires: WireService
  readonly plugins: PluginService
  readonly pluginSignals: PluginSignalService
  readonly transfer: ConfigTransfer
  /** holds back changing requests while an import runs */
  readonly lock = new ChangeLock()

  constructor({ db, bus, signals, log, ...parts }: ServiceParts) {
    const cleanup = new TopicCleanup(bus, db.snapshot)
    const unloadable = new UnloadableRows()
    this.loxoneSignals = new LoxoneSignalService(db.loxoneSignals, parts.miniservers, cleanup, unloadable, log)
    this.wires = new WireService(db.wires, parts.wires, signals, log)
    this.miniservers = new MiniserverService(db.miniservers, parts.miniservers, this.loxoneSignals, cleanup, unloadable, log, this.wires)
    const settings = parts.pluginAssembly.settingsCheck(id => db.pluginInstances.get(id), db.pluginStore)
    this.plugins = new PluginService(db.pluginInstances, db.pluginSignals, parts.plugins, parts.pluginCatalog, cleanup, log, parts.pluginLogs, this.wires, parts.selections, settings)
    this.pluginSignals = new PluginSignalService(db.pluginSignals, this.plugins, cleanup)
    const runtime = { cleanup, exists: (topic: string) => signals.atTopic(topic) !== undefined }
    const pluginTransfer = PluginTransfer.of(db, this.plugins, { catalog: parts.pluginCatalog, selections: parts.selections })
    const sources = { miniservers: this.miniservers, signals: this.loxoneSignals, wires: this.wires, selections: parts.selections, plugins: pluginTransfer }
    this.transfer = new ConfigTransfer(sources, log, { lock: this.lock, journal: parts.journal, runtime })
  }
}
