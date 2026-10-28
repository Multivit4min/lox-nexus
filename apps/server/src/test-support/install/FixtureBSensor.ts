import { Plugin, Sensor } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { FixtureConfig } from "./FixtureConfig.ts"

/** emits the start value doubled; version 2 of the fixture drops it */
export class BSensor extends Sensor<Plugin<FixtureConfig>, object> {
  static readonly id = "b"
  static readonly valueType = "number"

  override start() {
    this.emit(Value.number(this.plugin.config.start * 2))
  }
}
