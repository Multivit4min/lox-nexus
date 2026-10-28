import { Sensor } from "@lox-nexus/plugin-sdk"
import { Converter, type Value } from "@lox-nexus/plugin-sdk/values"
import type { ScriptPlugin } from "../ScriptPlugin.ts"
import { variableParams, type VariableParams } from "../VariableParams.ts"
import type { OutputSink } from "../variables/Outbox.ts"

/**
 * A value the script sends with `nexus.set(name, value)`, converted to the sensor's type. It
 * starts with the latest value the script set for its name, if any. Subclasses fix the type,
 * because a signal's type is declared per sensor class.
 */
export abstract class VariableSensor extends Sensor<ScriptPlugin, VariableParams> implements OutputSink {
  static readonly params = variableParams
  readonly name = this.params.name
  protected abstract readonly type: "number" | "string" | "boolean"

  override start() {
    this.onDispose(this.plugin.outbox.attach(this))
  }

  push(value: Value) {
    this.emit(Converter.convert(value, this.type))
  }
}
