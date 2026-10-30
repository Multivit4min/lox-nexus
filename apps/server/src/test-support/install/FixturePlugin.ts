import { Plugin, PluginEntry, z } from "@lox-nexus/plugin-sdk"
import { ASensor } from "./FixtureASensor.ts"
import { BSensor } from "./FixtureBSensor.ts"
import type { FixtureConfig } from "./FixtureConfig.ts"
import { SinkActuator } from "./FixtureSink.ts"

/**
 * The plugin the installer tests build into a bundle and install: id "fixture", not in the
 * workspace. Version 1 refuses a negative start value when it starts (a settings check can't
 * tell), so an instance can be in error before an update fixes it.
 */
class FixturePlugin extends Plugin<FixtureConfig> {
  static readonly config = z.object({ start: z.number().default(1) })
  static readonly sensors = [ASensor, BSensor]
  static readonly actuators = [SinkActuator]

  override start() {
    if (this.config.start < 0) throw new Error("start must not be negative")
  }
}

export default PluginEntry.define(FixturePlugin)
