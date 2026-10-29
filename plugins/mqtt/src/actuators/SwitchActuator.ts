import { z } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { publishFields } from "./PublishParams.ts"
import { PublishActuator } from "./PublishActuator.ts"

const word = (fallback: string, title: string) => z.string().max(100).default(fallback)
  .meta({ title, description: `What is published for ${fallback.toLowerCase()}, e.g. ${fallback}, ${fallback.toLowerCase()}, ${fallback === "ON" ? "true or 1" : "false or 0"}` })

const params = z.object({ ...publishFields, on: word("ON", "Payload for on"), off: word("OFF", "Payload for off") })

/** Publishes on or off as configurable words (ON and OFF by default); other values are converted to on/off first. */
export class SwitchActuator extends PublishActuator<z.infer<typeof params>, ValueOf<"boolean">> {
  static readonly id = "switch"
  static readonly label = "Switch (on/off)"
  static readonly description = "Publishes ON or OFF (or words you choose), e.g. to switch a plug"
  static readonly params = params
  static readonly accepts = "boolean"

  protected payload(value: ValueOf<"boolean">) {
    return value.value ? this.params.on : this.params.off
  }
}
