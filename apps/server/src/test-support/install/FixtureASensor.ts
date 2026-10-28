import { Plugin, Sensor } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { FixtureConfig } from "./FixtureConfig.ts"

/** emits the configured start value */
export class ASensor extends Sensor<Plugin<FixtureConfig>, object> {
  static readonly id = "a"
  static readonly valueType = "number"

  override start() {
    this.emit(Value.number(this.plugin.config.start))
  }
}
