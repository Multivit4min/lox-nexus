import { z } from "zod"
import type { BusActions } from "../../../services/BusActions.ts"
import type { McpTool } from "../../McpTool.ts"
import type { ToolContext } from "../../ToolContext.ts"
import { ValueInput, type OperateValues } from "./OperateValues.ts"

const Force = z.object({
  signal: z.string().min(1).max(300).describe("the signal's topic (or id)"),
  value: ValueInput,
  reason: z.string().min(1).max(500).describe("why, for whoever finds the force later"),
  minutes: z.number().int().min(1).max(1440).default(60).describe("released by itself after this long; at most 24 h")
})
const Release = z.object({ signal: z.string().min(1).max(300).describe("the forced signal's topic (or id)") })
const Inject = z.object({
  signal: z.string().min(1).max(300).describe("the signal's topic (or id)"),
  value: ValueInput,
  kind: z.enum(["state", "command"]).optional().describe("command: an actuator acts on it (the default for actuators); state: as if the signal had the value (the default otherwise)")
})

const OPERATE = { scope: "operate" as const, changes: true, annotations: { openWorldHint: true } }

/** Pins a value on a signal for a while: wires and devices see only it until it is released or expires. */
export class ForceTool implements McpTool<z.infer<typeof Force>> {
  readonly name = "force"
  readonly title = "Force a value"
  readonly description = "Pin a value on a signal: everything wired to it, and the device or Miniserver behind it, gets this value and ignores real ones until release or the end of `minutes` (default 60, at most 24 h). A force on an actuator or a Nexus out signal acts on the house. Give a reason."
  readonly scope = OPERATE.scope
  readonly changes = OPERATE.changes
  readonly annotations = OPERATE.annotations
  readonly input = Force

  constructor(private readonly values: OperateValues, private readonly bus: Pick<BusActions, "force">, private readonly now: () => number) {}

  run(input: z.infer<typeof Force>, context: ToolContext) {
    const signal = this.values.signal(input.signal)
    const value = this.values.value(signal, input.value)
    const until = this.now() + input.minutes * 60_000
    this.bus.force(signal.topic, value, { by: context.by, reason: input.reason, until })
    return { forced: signal.topic, value: this.values.format(value, signal), until: new Date(until).toISOString() }
  }
}

/** Ends a force: the signal goes back to its real value. */
export class ReleaseTool implements McpTool<z.infer<typeof Release>> {
  readonly name = "release"
  readonly title = "Release a force"
  readonly description = "End a force: the signal takes its real value again, and what is wired to it follows."
  readonly scope = OPERATE.scope
  readonly changes = OPERATE.changes
  readonly annotations = { ...OPERATE.annotations, idempotentHint: true }
  readonly input = Release

  constructor(private readonly values: OperateValues, private readonly bus: Pick<BusActions, "release">) {}

  run(input: z.infer<typeof Release>, context: ToolContext) {
    const signal = this.values.signal(input.signal)
    this.bus.release(signal.topic, context.by)
    return { released: signal.topic }
  }
}

/** Sends one value, flagged as injected: a test, or a one-off command to a device. */
export class InjectTool implements McpTool<z.infer<typeof Inject>> {
  readonly name = "inject"
  readonly title = "Send one value"
  readonly description = "Send one value on a signal, once, marked as injected: to test a wire, or as a one-off command. On an actuator it acts on the device; on a Nexus out signal the Miniserver gets it. The next real value replaces it."
  readonly scope = OPERATE.scope
  readonly changes = OPERATE.changes
  readonly annotations = OPERATE.annotations
  readonly input = Inject

  constructor(private readonly values: OperateValues, private readonly bus: Pick<BusActions, "inject">) {}

  run(input: z.infer<typeof Inject>, context: ToolContext) {
    const signal = this.values.signal(input.signal)
    const value = this.values.value(signal, input.value)
    const kind = input.kind ?? (signal.dir === "actuator" ? "command" : "state")
    this.bus.inject(signal.topic, value, kind, context.by)
    return { sent: signal.topic, value: this.values.format(value, signal), kind }
  }
}
