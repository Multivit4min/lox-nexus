import { Sensor } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { MqttPlugin } from "../MqttPlugin.ts"
import { PayloadReader } from "../payload/PayloadReader.ts"
import type { Message, TopicListener } from "../topics/TopicRouter.ts"
import { sensorParams, type SensorParams } from "./SensorParams.ts"

/** a converted value, or why the raw value doesn't fit the sensor's type */
export type Coerced = { ok: true; value: Value } | { ok: false; problem: string }

/**
 * A value from each message on one topic, retained ones included. Subclasses fix the value type
 * and convert strictly: a payload that doesn't fit puts the signal into the error state with the
 * reason, instead of sending a made-up value, and the next good message clears it.
 */
export abstract class MessageSensor extends Sensor<MqttPlugin, SensorParams> implements TopicListener {
  static readonly params = sensorParams

  private readonly reader = new PayloadReader(this.params.read === "json", this.params.path)
  private problem: string | undefined

  override start() {
    this.onDispose(this.plugin.router.add(this.params.topic, this))
  }

  message({ payload }: Message) {
    const read = this.reader.read(payload)
    if (!read.ok) return this.report(read.problem)
    const coerced = this.coerce(read.raw)
    if (!coerced.ok) return this.report(`${this.reader.summary}: ${coerced.problem}`)
    this.problem = undefined
    this.emit(coerced.value)
  }

  refused(reason: string) {
    this.report(reason)
  }

  protected abstract coerce(raw: unknown): Coerced

  /** a short name for the JSON type of a value, for messages */
  protected static typeOf(raw: unknown) {
    return raw === null ? "null" : Array.isArray(raw) ? "an array" : typeof raw === "object" ? "an object" : `a ${typeof raw}`
  }

  /** the start of a text for a message, so a large payload doesn't fill the signal's error */
  protected static quote(text: string) {
    return JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}…` : text)
  }

  // the same problem again (every message of a broken device) is reported once
  private report(problem: string) {
    if (problem === this.problem) return
    this.problem = problem
    this.fail(problem)
  }
}
