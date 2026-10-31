import { z } from "zod"
import type { McpTool } from "../../McpTool.ts"
import type { PluginRefs } from "../plugins/PluginRefs.ts"
import { InstanceAnswer, type InstanceWrites } from "./InstanceWrites.ts"

const Input = z.object({
  instance: z.string().min(1).max(100).describe("the instance's slug"),
  action: z.enum(["start", "stop", "restart"])
})

/** Starts, stops or restarts a plugin instance until the next boot, where `enabled` decides. */
export class InstanceLifecycleTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "plugin_instance_lifecycle"
  readonly title = "Start, stop or restart a plugin instance"
  readonly description = "Start, stop or restart a plugin instance. Lasts until Nexus restarts; whether it runs then is the instance's `enabled` setting (update_plugin_instance). A stopped instance's signals keep their last values but don't update; its actuators don't act."
  readonly scope = "configure" as const
  readonly changes = true
  readonly timeoutMs = 60_000
  readonly input = Input

  constructor(private readonly refs: Pick<PluginRefs, "instance">, private readonly instances: Pick<InstanceWrites, "start" | "stop">) {}

  async run(input: z.infer<typeof Input>) {
    const { id } = this.refs.instance(input.instance)
    if (input.action === "stop") return InstanceAnswer.of(await this.instances.stop(id))
    if (input.action === "restart") await this.instances.stop(id)
    return InstanceAnswer.of(await this.instances.start(id))
  }
}
