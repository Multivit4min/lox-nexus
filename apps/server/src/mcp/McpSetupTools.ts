import type { MiniserverDto } from "@lox-nexus/api"
import type { InventoryService } from "../services/InventoryService.ts"
import type { McpRefs } from "./McpRefs.ts"
import type { McpTool } from "./McpTool.ts"
import { CheckSettingsTool, DiscoverSettingTool } from "./tools/instances/CheckSettingsTools.ts"
import { CreateInstanceTool } from "./tools/instances/CreateInstanceTool.ts"
import { DeleteInstanceTool } from "./tools/instances/DeleteInstanceTool.ts"
import { InstanceLifecycleTool } from "./tools/instances/InstanceLifecycleTool.ts"
import type { InstanceWrites, SettingsChecks } from "./tools/instances/InstanceWrites.ts"
import { UpdateInstanceTool } from "./tools/instances/UpdateInstanceTool.ts"
import { CreateMiniserverTool } from "./tools/miniservers/CreateMiniserverTool.ts"
import { DeleteMiniserverTool } from "./tools/miniservers/DeleteMiniserverTool.ts"
import { StartMiniserverTool, StopMiniserverTool } from "./tools/miniservers/MiniserverLifecycleTools.ts"
import type { MiniserverWrites } from "./tools/miniservers/MiniserverWrites.ts"
import { UpdateMiniserverTool } from "./tools/miniservers/UpdateMiniserverTool.ts"
import { DeletePluginSignalsTool } from "./tools/plugins/DeletePluginSignalsTool.ts"
import type { PluginRefs } from "./tools/plugins/PluginRefs.ts"
import { AddPluginSignalsTool, UpdatePluginSignalTool, type PluginSignalWrites } from "./tools/plugins/PluginSignalTools.ts"

/** what the setup tools change */
export interface McpSetupSources {
  miniservers: { list(): MiniserverDto[] } & MiniserverWrites
  plugins: InstanceWrites
  /** PluginSettingsCheck; without it, settings are saved unchecked and there is no Find */
  settings?: SettingsChecks | undefined
  pluginSignals: PluginSignalWrites
}

/** The setup tools of A3 (ADR 0020): Miniservers, plugin instances and plugin signals. */
export class McpSetupTools {
  readonly tools: McpTool[]

  constructor(sources: McpSetupSources, refs: { miniservers: McpRefs; plugins: PluginRefs }, inventory: Pick<InventoryService, "signals" | "impact">) {
    const { miniservers, plugins, settings, pluginSignals } = sources
    this.tools = [
      new CreateMiniserverTool(miniservers),
      new UpdateMiniserverTool(refs.miniservers, miniservers),
      new DeleteMiniserverTool(refs.miniservers, miniservers, inventory),
      new StartMiniserverTool(refs.miniservers, miniservers),
      new StopMiniserverTool(refs.miniservers, miniservers),
      new CreateInstanceTool(refs.plugins, plugins),
      new UpdateInstanceTool(refs.plugins, plugins),
      new DeleteInstanceTool(refs.plugins, plugins, inventory),
      new InstanceLifecycleTool(refs.plugins, plugins),
      new CheckSettingsTool(refs.plugins, settings),
      new DiscoverSettingTool(refs.plugins, settings),
      new AddPluginSignalsTool(refs.plugins, pluginSignals),
      new UpdatePluginSignalTool(refs.plugins, pluginSignals),
      new DeletePluginSignalsTool(refs.plugins, pluginSignals, inventory)
    ]
  }
}
