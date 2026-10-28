import { Sensor } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import { ValueSource } from "../call/ValueSource.ts"
import type { WebhookCall } from "../call/WebhookCall.ts"
import type { HookHandler } from "../hooks/HookHandler.ts"
import type { WebhookPlugin } from "../WebhookPlugin.ts"
import { valueParams, type ValueParams } from "./ValueParams.ts"

/** a converted value, or why the raw value doesn't fit the sensor's type */
export type Coerced = { ok: true; value: Value } | { ok: false; problem: string }

/**
 * A value read from each call (JSON path, query parameter, form field or body) and emitted as is:
 * unlike the old integration it isn't reset afterwards. Subclasses fix the value type, because a
 * signal's type is declared per sensor class, and convert strictly: "21.5" is a number, "abc" is a
 * 400 for the caller rather than a silent 0 on the bus.
 */
export abstract class ValueSensor extends Sensor<WebhookPlugin, ValueParams> implements HookHandler {
  static readonly params = valueParams

  readonly hook = this.params.hook
  readonly method = this.params.method
  private readonly source = new ValueSource(this.params.source, this.params.source === "json" ? this.params.path : this.params.name)

  get summary() {
    return `${this.kind} from ${this.source.summary}`
  }

  override start() {
    this.onDispose(this.plugin.hooks.add(this))
  }

  handle(call: WebhookCall) {
    const extracted = this.source.extract(call)
    if (!extracted.ok) return extracted.problem
    const coerced = this.coerce(extracted.raw)
    if (!coerced.ok) return `${this.source.summary}: ${coerced.problem}`
    this.emit(coerced.value)
    return undefined
  }

  /** the sensor's id, for summaries */
  protected abstract readonly kind: string

  protected abstract coerce(raw: unknown): Coerced

  /** a short name for the JSON type of a value, for error messages */
  protected static typeOf(raw: unknown) {
    return raw === null ? "null" : Array.isArray(raw) ? "an array" : typeof raw === "object" ? "an object" : `a ${typeof raw}`
  }
}
