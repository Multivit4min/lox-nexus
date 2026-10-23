import { Converter, type Value, type ValueType } from "@lox-nexus/plugin-sdk/values"
import { StatelessTransform } from "./Transform.ts"

export class ConvertTransform extends StatelessTransform {
  constructor(private readonly to: ValueType) {
    super()
  }

  protected apply(value: Value): Value {
    return Converter.convert(value, this.to)
  }
}
