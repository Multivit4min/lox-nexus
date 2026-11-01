import { Actuator } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { SmartPlugPlugin } from "../SmartPlugPlugin.ts"

/** Switches the plug on (true) or off (false). */
export class SwitchActuator extends Actuator<SmartPlugPlugin, Record<string, never>, ValueOf<"boolean">> {
  static readonly id = "switch"
  static readonly label = "Switch"
  static readonly description = "Switches the plug on or off"
  // a wire turns 1/0 from a Loxone output into true/false before run() sees it
  static readonly accepts = "boolean"
  // someone pressing a button five times only needs the last press to reach the plug
  static readonly concurrency = "latest"

  async run(value: ValueOf<"boolean">) {
    await this.plugin.client.switch(value.value)
    // read the plug at once, so "Switched on" follows now instead of at the next reading
    await this.plugin.poll()
  }
}
