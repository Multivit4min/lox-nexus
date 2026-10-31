import { z } from "zod"
import { HttpError } from "../../../http/HttpError.ts"
import type { McpTool } from "../../McpTool.ts"
import { SecretInputs } from "../../SecretInputs.ts"
import type { PluginRefs } from "../plugins/PluginRefs.ts"
import { InstanceAnswer, type InstanceWrites, type SettingsChecks } from "./InstanceWrites.ts"

const Input = z.object({
  plugin: z.string().min(1).max(100).describe("the plugin's id, from overview or describe_plugin"),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).describe("the topic segment, e.g. \"home\" for homeassistant/home/…"),
  label: z.string().max(100),
  config: z.record(z.string(), z.unknown()).default({}).describe("the settings as describe_plugin's config schema says, without secret fields"),
  enabled: z.boolean().default(true)
})

/**
 * Creates a plugin instance from settings an agent may give. One whose required secrets are
 * missing is saved without starting; the answer says which, and where the user enters them.
 */
export class CreateInstanceTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "create_plugin_instance"
  readonly title = "Add a plugin instance"
  readonly description = "Add an instance of an installed plugin (describe_plugin shows its settings) and start it. Secret settings are never given by you: if the plugin needs one (a token), the instance is saved without starting, and the answer names `missingSecrets` and the `page` where the user enters them. Other wrong settings are refused with the plugin's reasons."
  readonly scope = "configure" as const
  readonly changes = true
  // the plugin checks the settings in a worker of its own first
  readonly timeoutMs = 60_000
  readonly input = Input

  constructor(private readonly refs: Pick<PluginRefs, "package">, private readonly instances: Pick<InstanceWrites, "create">, private readonly settings?: Pick<SettingsChecks, "check">) {}

  async run(input: z.infer<typeof Input>) {
    const pkg = this.refs.package(input.plugin)
    if (pkg.id !== input.plugin) throw HttpError.badRequest(`"${input.plugin}" is an instance; give the plugin's id ("${pkg.id}")`)
    SecretInputs.refuse(pkg.description.config, input.config, "secret settings")
    const missing = SecretInputs.required(pkg.description.config).filter(name => input.config[name] === undefined)
    if (missing.length === 0) return InstanceAnswer.of(await this.instances.create(input))
    // the rest is checked now, so the user only has the secrets left to enter
    const check = await this.settings?.check({ plugin: pkg.id, config: input.config })
    const other = check?.issues.filter(issue => !missing.includes(String(issue.path[0]))) ?? []
    if (other.length) throw HttpError.badRequest(`the plugin refuses these settings: ${other.map(issue => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ")}`)
    return InstanceAnswer.of(await this.instances.create(input, { secretsLater: true }), missing)
  }
}
