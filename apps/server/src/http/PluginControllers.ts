import type { PluginAssembly } from "../plugins/PluginAssembly.ts"
import { PluginActionService } from "../services/PluginActionService.ts"
import { PluginBridgeService } from "../services/PluginBridgeService.ts"
import type { LoxoneSignalService } from "../services/LoxoneSignalService.ts"
import type { PluginLogs } from "../services/PluginLogs.ts"
import type { PluginService } from "../services/PluginService.ts"
import type { PluginSignalService } from "../services/PluginSignalService.ts"
import type { WireService } from "../services/WireService.ts"
import type { Logger } from "pino"
import type { Controller } from "./Controller.ts"
import { PluginController } from "./controllers/PluginController.ts"
import { PluginLogController } from "./controllers/PluginLogController.ts"
import { PluginPackageController } from "./controllers/PluginPackageController.ts"

/** What the plugin routes work with; all built by NexusApp. */
export interface PluginControllerDeps {
  plugins: PluginService
  pluginSignals: PluginSignalService
  loxoneSignals: LoxoneSignalService
  wires: WireService
  logs: PluginLogs
  assembly: Pick<PluginAssembly, "packages" | "updates">
  log: Logger
}

/** The route groups of plugins: instances and signals, their logs, and installed packages. */
export class PluginControllers {
  static build({ plugins, pluginSignals, loxoneSignals, wires, logs, assembly, log }: PluginControllerDeps): Controller[] {
    return [
      new PluginController(plugins, pluginSignals, new PluginBridgeService(pluginSignals, loxoneSignals, wires, log), new PluginActionService(id => plugins.supervisor(id), logs)),
      new PluginLogController(plugins, logs),
      new PluginPackageController(assembly.packages(plugins), assembly.updates(plugins))
    ]
  }
}
