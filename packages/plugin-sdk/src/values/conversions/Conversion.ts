import type { Value, ValueOf, ValueType } from "../Value.ts"
import { ValueDefaults } from "../ValueDefaults.ts"

/** Converts any value into one target type; anything that can't be converted yields the default. */
export abstract class Conversion<T extends ValueType> {
  abstract readonly target: T

  convert(value: Value): ValueOf<T> {
    if (value.type === this.target) return value as ValueOf<T>
    try {
      return this.from(value)
    } catch {
      return this.fallback()
    }
  }

  protected fallback(): ValueOf<T> {
    return ValueDefaults.for(this.target)
  }

  protected abstract from(value: Value): ValueOf<T>
}
