import type { Value, ValueOf, ValueType } from "../Value.ts"
import { ValueDefaults } from "../ValueDefaults.ts"

/**
 * Converts any value into one target type; anything that can't be converted yields the default.
 * Subclasses implement only from(), the same-type shortcut and error handling live here.
 */
export abstract class Conversion<T extends ValueType> {
  abstract readonly target: T

  /** never throws: an exception inside from() is turned into the default value */
  convert(value: Value): ValueOf<T> {
    if (value.type === this.target) return value as ValueOf<T>
    try {
      return this.from(value)
    } catch {
      return this.fallback()
    }
  }

  /** the default for the target type, for source types that have no sensible mapping */
  protected fallback(): ValueOf<T> {
    return ValueDefaults.for(this.target)
  }

  /** called only for values of another type than target */
  protected abstract from(value: Value): ValueOf<T>
}
