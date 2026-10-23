import { Converter, Value } from "@lox-nexus/plugin-sdk/values"
import { StatelessTransform } from "./Transform.ts"

/** Negates the value as a boolean (any value is converted to boolean first). */
export class InvertTransform extends StatelessTransform {
  protected apply(value: Value): Value {
    return Value.boolean(!Converter.convert(value, "boolean").value)
  }
}
