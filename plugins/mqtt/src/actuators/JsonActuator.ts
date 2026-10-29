import type { Value } from "@lox-nexus/plugin-sdk/values"
import { ValuePayload } from "../payload/ValuePayload.ts"
import { publishParams } from "./PublishParams.ts"
import { PublishActuator } from "./PublishActuator.ts"

/** Publishes the whole value with its type as JSON, e.g. {"type":"rgbw","value":{"red":100,…}}. */
export class JsonActuator extends PublishActuator {
  static readonly id = "json"
  static readonly label = "Value as JSON"
  static readonly description = "Publishes the value with its type as JSON, for receivers that handle any kind of value"
  static readonly params = publishParams
  static readonly accepts = "any"

  protected payload(value: Value) {
    return ValuePayload.json(value)
  }
}
