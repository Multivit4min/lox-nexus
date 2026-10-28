import { Actuator, Plugin } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { FixtureConfig } from "./FixtureConfig.ts"

/** accepts numbers and does nothing, so a wire has a target */
export class SinkActuator extends Actuator<Plugin<FixtureConfig>, object, ValueOf<"number">> {
  static readonly id = "sink"
  static readonly accepts = "number"

  run() {}
}
