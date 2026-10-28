import { Sensor, z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { HookHandler } from "../hooks/HookHandler.ts"
import { HookMethods } from "../hooks/HookMethod.ts"
import { HookName } from "../hooks/HookName.ts"
import type { WebhookPlugin } from "../WebhookPlugin.ts"

const params = z.object({
  hook: HookName.schema,
  method: HookMethods.schema("any"),
  pulseMs: z.number().int().min(50).max(3_600_000).default(1000)
    .describe("How long the signal stays true after a call, in milliseconds (50 to 3 600 000)")
})

/**
 * A boolean pulse per call: true, and false again `pulseMs` after the last call. A call during
 * the pulse restarts the one reset timer instead of adding another, so the pulse is extended
 * rather than cut short by an earlier call's timer, and removing the signal clears the timer.
 * Starts false so the target has a defined state.
 */
export class TriggerSensor extends Sensor<WebhookPlugin, z.infer<typeof params>> implements HookHandler {
  static readonly id = "trigger"
  static readonly label = "Trigger (pulse)"
  static readonly params = params
  static readonly valueType = "boolean"

  readonly hook = this.params.hook
  readonly method = this.params.method
  readonly summary = `trigger, ${this.params.pulseMs} ms pulse`
  private cancelReset: (() => void) | undefined

  override start() {
    this.emit(Value.boolean(false))
    this.onDispose(this.plugin.hooks.add(this))
  }

  handle() {
    this.cancelReset?.()
    this.emit(Value.boolean(true))
    this.cancelReset = this.after(this.params.pulseMs, () => {
      this.cancelReset = undefined
      this.emit(Value.boolean(false))
    })
    return undefined
  }
}
