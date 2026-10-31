import { z } from "zod"
import type { McpTool } from "../../McpTool.ts"
import { SecretInputs } from "../../SecretInputs.ts"
import type { ToolContext } from "../../ToolContext.ts"
import type { PluginRefs } from "../plugins/PluginRefs.ts"
import { InstanceAnswer, type InstanceWrites } from "./InstanceWrites.ts"

const Input = z.object({
  instance: z.string().min(1).max(100).describe("the instance's slug"),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional().describe("a new slug moves all its topics"),
  label: z.string().max(100).optional(),
  config: z.record(z.string(), z.unknown()).optional().describe("only the top-level settings that change (a nested one is replaced whole), without secret fields; null removes one"),
  enabled: z.boolean().optional()
})

/** Changes a plugin instance: only what is given; secret settings stay as stored. */
export class UpdateInstanceTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "update_plugin_instance"
  readonly title = "Change a plugin instance"
  readonly description = "Change a plugin instance's label, slug, settings (only those that change; null removes one) or enabled. Secret settings are never given by you and stay as stored. The plugin checks the settings first; a running instance restarts with them. Needs the operate permission, like creating one."
  readonly scope = "operate" as const
  readonly changes = true
  readonly timeoutMs = 60_000
  readonly input = Input

  constructor(private readonly refs: Pick<PluginRefs, "instance" | "package">, private readonly instances: Pick<InstanceWrites, "update">) {}

  async run(input: z.infer<typeof Input>, context: ToolContext) {
    const current = this.refs.instance(input.instance)
    SecretInputs.refuse(this.refs.package(current.plugin).description.config, input.config ?? {}, "secret settings")
    const merged = Object.fromEntries(Object.entries({ ...current.config, ...input.config }).filter(([, value]) => value !== null))
    const updated = await this.instances.update(current.id, {
      plugin: current.plugin,
      slug: input.slug ?? current.slug,
      label: input.label ?? current.label,
      config: merged,
      enabled: input.enabled ?? current.enabled
    }, context.by)
    return InstanceAnswer.of(updated)
  }
}
