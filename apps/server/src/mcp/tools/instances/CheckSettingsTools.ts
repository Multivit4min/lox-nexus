import { z } from "zod"
import { HttpError } from "../../../http/HttpError.ts"
import type { McpTool } from "../../McpTool.ts"
import { SecretInputs } from "../../SecretInputs.ts"
import type { PluginRefs } from "../plugins/PluginRefs.ts"
import type { SettingsChecks } from "./InstanceWrites.ts"

const Check = z.object({
  plugin: z.string().min(1).max(100).describe("the plugin's id, or an instance's slug: then its stored secrets fill in what you leave out"),
  config: z.record(z.string(), z.unknown()).default({}).describe("the settings to check, without secret fields"),
  test: z.boolean().default(false).describe("also run the plugin's connection test (it contacts the device or service)")
})
const Discover = z.object({
  plugin: z.string().min(1).max(100).describe("the plugin's id"),
  field: z.string().min(1).max(100).describe("a setting describe_plugin lists under `discoverable`"),
  config: z.record(z.string(), z.unknown()).default({}).describe("settings that narrow the search, if the plugin uses any")
})

/** The settings form's checks: the plugin's own validation and, with `test`, its connection test. Saves nothing. */
export class CheckSettingsTool implements McpTool<z.infer<typeof Check>> {
  readonly name = "check_plugin_settings"
  readonly title = "Check plugin settings"
  readonly description = "Let the plugin check settings before you save them: answers the problems at their fields, and with test: true whether it can connect. Saves nothing. Name an instance to check changes to it with its stored secrets."
  readonly scope = "configure" as const
  readonly annotations = { readOnlyHint: true, openWorldHint: true }
  readonly timeoutMs = 60_000
  readonly input = Check

  constructor(private readonly refs: Pick<PluginRefs, "package" | "instance">, private readonly settings?: Pick<SettingsChecks, "check">) {}

  async run(input: z.infer<typeof Check>) {
    if (!this.settings) throw HttpError.notFound("settings checks")
    const pkg = this.refs.package(input.plugin)
    SecretInputs.refuse(pkg.description.config, input.config, "secret settings")
    const instance = pkg.id === input.plugin ? undefined : this.refs.instance(input.plugin)
    const config = instance ? { ...instance.config, ...input.config } : input.config
    return this.settings.check({ plugin: pkg.id, config, test: input.test, ...(instance ? { instanceId: instance.id } : {}) })
  }
}

/** Find on the network: devices or servers a plugin's setting could point at, e.g. Home Assistant over mDNS. */
export class DiscoverSettingTool implements McpTool<z.infer<typeof Discover>> {
  readonly name = "discover_setting"
  readonly title = "Find on the network"
  readonly description = "Search the local network for what a plugin setting could point at (a Home Assistant server, an MQTT broker): answers label, value and detail per find. Only for settings describe_plugin lists under `discoverable`. Takes a few seconds."
  readonly scope = "configure" as const
  readonly annotations = { readOnlyHint: true, openWorldHint: true }
  readonly timeoutMs = 30_000
  readonly input = Discover

  constructor(private readonly refs: Pick<PluginRefs, "package">, private readonly settings?: Pick<SettingsChecks, "discover">) {}

  async run(input: z.infer<typeof Discover>) {
    if (!this.settings) throw HttpError.notFound("Find on the network")
    const pkg = this.refs.package(input.plugin)
    SecretInputs.refuse(pkg.description.config, input.config, "secret settings")
    return this.settings.discover(pkg.id, { field: input.field, config: input.config })
  }
}
