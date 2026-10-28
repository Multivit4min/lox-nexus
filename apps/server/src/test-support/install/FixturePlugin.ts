import { Plugin, PluginEntry, Sensor, z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"

/** emits the configured start value */
class ASensor extends Sensor<FixturePlugin, object> {
  static readonly id = "a"
  static readonly valueType = "number"

  override start() {
    this.emit(Value.number(this.plugin.config.start))
  }
}

/** emits the start value doubled */
class BSensor extends Sensor<FixturePlugin, object> {
  static readonly id = "b"
  static readonly valueType = "number"

  override start() {
    this.emit(Value.number(this.plugin.config.start * 2))
  }
}

/** The plugin the installer tests build into a bundle and install: id "fixture", not in the workspace. */
class FixturePlugin extends Plugin<{ start: number }> {
  static readonly config = z.object({ start: z.number().default(1) })
  static readonly sensors = [ASensor, BSensor]
  static readonly actuators = []
}

export default PluginEntry.define(FixturePlugin)
