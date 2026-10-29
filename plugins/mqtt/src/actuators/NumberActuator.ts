import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { ValuePayload } from "../payload/ValuePayload.ts"
import { publishParams, type PublishParams } from "./PublishParams.ts"
import { PublishActuator } from "./PublishActuator.ts"

/** Publishes a number as text ("21.5"); other values are converted to a number first. */
export class NumberActuator extends PublishActuator<PublishParams, ValueOf<"number">> {
  static readonly id = "number"
  static readonly label = "Number"
  static readonly description = "Publishes a number, e.g. a set point or a dimmer level"
  static readonly params = publishParams
  static readonly accepts = "number"

  protected payload(value: ValueOf<"number">) {
    return ValuePayload.text(value)
  }
}
