import type { Value } from "@lox-nexus/plugin-sdk/values"
import { ValuePayload } from "../payload/ValuePayload.ts"
import { publishParams } from "./PublishParams.ts"
import { PublishActuator } from "./PublishActuator.ts"

/** Publishes any value as plain text; structured values (RGBW, dimmer channels) as their JSON object. */
export class TextActuator extends PublishActuator {
  static readonly id = "text"
  static readonly label = "Text"
  static readonly description = "Publishes the value as text: 21.5, true, a string as it is, colours as JSON"
  static readonly params = publishParams
  static readonly accepts = "any"

  protected payload(value: Value) {
    return ValuePayload.text(value)
  }
}
