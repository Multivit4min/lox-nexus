import { Sensor } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { SmartPlugPlugin } from "../SmartPlugPlugin.ts"

/** Whether the plug is on, also when someone pressed its button or an app switched it. */
export class SwitchedOnSensor extends Sensor<SmartPlugPlugin> {
  static readonly id = "switched-on"
  static readonly label = "Switched on"
  static readonly description = "On while the plug is switched on"
  static readonly valueType = "boolean"

  override start() {
    this.listen(this.plugin.readings, "reading", status => this.emit(Value.boolean(status.on)))
    if (this.plugin.latest) this.emit(Value.boolean(this.plugin.latest.on))
  }
}
