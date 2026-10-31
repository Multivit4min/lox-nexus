import type { EventBus } from "@lox-nexus/core"
import type { Logger } from "pino"
import type { Persistence } from "../db/Persistence.ts"
import type { PluginCatalog } from "../plugins/PluginCatalog.ts"
import { BusActions } from "../services/BusActions.ts"
import { PluginActionService } from "../services/PluginActionService.ts"
import { PluginBridgeService } from "../services/PluginBridgeService.ts"
import type { PluginEvents } from "../services/PluginEvents.ts"
import type { PluginLogs } from "../services/PluginLogs.ts"
import type { LoxoneSignalService } from "../services/LoxoneSignalService.ts"
import type { PluginService } from "../services/PluginService.ts"
import type { PluginSignalService } from "../services/PluginSignalService.ts"
import type { WireService } from "../services/WireService.ts"
import type { McpDeps } from "./McpAssembly.ts"
import { McpToolset, type McpToolSources } from "./McpToolset.ts"
import { SecretRedactor } from "./SecretRedactor.ts"

/** the app's parts the MCP interface works with; NexusApp passes them, as it does to PluginControllers */
export type McpAppParts = Omit<McpToolSources, "bridges" | "busActions" | "actions" | "logs" | "settings" | "plugins" | "bus" | "loxoneSignals" | "pluginSignals" | "wires"> & {
  plugins: PluginService
  loxoneSignals: LoxoneSignalService
  pluginSignals: PluginSignalService
  wires: WireService
  bus: EventBus
  logs: PluginLogs
  events: PluginEvents
  db: Pick<Persistence, "miniservers" | "pluginInstances" | "pluginSignals">
  catalog: Pick<PluginCatalog, "get">
  log: Logger
}

/** Builds the tools and the redactor from the app's services, so NexusApp stays one call. */
export class McpServices {
  static assemble(parts: McpAppParts): Omit<McpDeps, "lock" | "clock"> {
    const { plugins, pluginSignals, loxoneSignals, wires, logs, events, db, catalog, log, version } = parts
    const toolset = new McpToolset({
      ...parts,
      logs,
      settings: plugins.settings,
      bridges: new PluginBridgeService(pluginSignals, loxoneSignals, wires, log),
      busActions: new BusActions(parts.bus),
      actions: new PluginActionService(id => plugins.supervisor(id), logs, events)
    })
    return { ...toolset, log, version, redactor: SecretRedactor.of(db, catalog) }
  }
}
