import { Plugin, PluginEntry, z } from "@lox-nexus/plugin-sdk"
import { ASensor } from "./FixtureASensor.ts"
import type { FixtureConfig } from "./FixtureConfig.ts"
import { SinkActuator } from "./FixtureSink.ts"

/** Version 2 of the fixture: sensor "b" is gone, and negative start values are accepted. */
class FixturePluginV2 extends Plugin<FixtureConfig> {
  static readonly config = z.object({ start: z.number().default(1) })
  static readonly sensors = [ASensor]
  static readonly actuators = [SinkActuator]
}

export default PluginEntry.define(FixturePluginV2)
