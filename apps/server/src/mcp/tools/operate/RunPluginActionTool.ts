import type { PluginActionResultDto } from "@lox-nexus/api"
import { z } from "zod"
import { HttpError } from "../../../http/HttpError.ts"
import type { McpTool } from "../../McpTool.ts"
import type { ToolContext } from "../../ToolContext.ts"
import { PanelText } from "../plugins/PanelText.ts"
import type { PluginRefs } from "../plugins/PluginRefs.ts"

const Input = z.object({
  instance: z.string().min(1).max(100).describe("the plugin instance's slug"),
  action: z.string().min(1).max(100).describe("the action's id, from describe_plugin or a button in get_panel"),
  input: z.record(z.string(), z.unknown()).default({}).describe("as the action's input schema says; a get_panel button gives it"),
  confirmation: z.string().max(64).optional().describe("for actions that ask first: from the first call's answer")
})

/** Runs a plugin action, as its button on the plugin's page does; one that asks the user first asks the agent too. */
export class RunPluginActionTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "run_plugin_action"
  readonly title = "Run a plugin action"
  readonly description = "Run an action of a plugin instance (restart a device, open a pairing window, create a voucher), as its button on the plugin's page does. An action that asks the user first answers its question and a confirmation the first time; call again with it. The answer is the action's message and, if it shows one, a panel part (a QR code only in the web UI)."
  readonly scope = "operate" as const
  readonly changes = true
  // like its REST route: a pairing may take two minutes, which must not hold off a config import
  readonly lockFree = true
  readonly annotations = { openWorldHint: true }
  readonly timeoutMs = 150_000
  readonly input = Input

  constructor(private readonly refs: Pick<PluginRefs, "instance" | "package">, private readonly actions: { run(instanceId: string, action: string, input: unknown, by: string): Promise<PluginActionResultDto> }) {}

  confirm(input: z.infer<typeof Input>) {
    const { instance, action } = this.find(input)
    return action.confirm ? { summary: `${instance.label}: ${action.confirm}`, bind: [instance.id, action.id] } : undefined
  }

  async run(input: z.infer<typeof Input>, context: ToolContext) {
    const { instance, action } = this.find(input)
    const answer = await this.actions.run(instance.id, action.id, input.input, context.by)
    return { action: action.id, ...(answer.message ? { message: answer.message } : {}), ...(answer.panel ? { panel: PanelText.of(answer.panel) } : {}) }
  }

  // like PluginActionService's own log: the input's fields, not their values (a pairing or voucher code)
  audited(input: z.infer<typeof Input>) {
    return { instance: input.instance, action: input.action, inputFields: Object.keys(input.input) }
  }

  private find(input: z.infer<typeof Input>) {
    const instance = this.refs.instance(input.instance)
    const actions = this.refs.package(instance.plugin).description.actions ?? []
    const action = actions.find(candidate => candidate.id === input.action)
    if (!action) throw HttpError.notFound(`action "${input.action}" of ${instance.slug} (it has: ${actions.map(candidate => candidate.id).join(", ") || "none"})`)
    return { instance, action }
  }
}
