import { Value } from "@lox-nexus/plugin-sdk/values"
import { StatelessTransform } from "./Transform.ts"

/**
 * Replaces matching values; unmatched values become `otherwise`, or pass unchanged without it.
 * Matching uses Value.equals, so it is type-strict: the number 1 does not match the boolean true.
 * The first matching case wins.
 */
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
