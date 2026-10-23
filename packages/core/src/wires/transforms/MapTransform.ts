import { Value } from "@lox-nexus/plugin-sdk/values"
import { StatelessTransform } from "./Transform.ts"

/** Replaces matching values; unmatched values become `otherwise`, or pass unchanged without it. */
export class MapTransform extends StatelessTransform {
  constructor(
    private readonly cases: ReadonlyArray<{ when: Value; then: Value }>,
    private readonly otherwise?: Value
  ) {
    super()
  }

  protected apply(value: Value): Value {
    const match = this.cases.find(entry => Value.equals(entry.when, value))
    return match?.then ?? this.otherwise ?? value
  }
}
