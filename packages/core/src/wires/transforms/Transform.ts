import type { DisposableLike } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { Cause } from "../../bus/BusMessage.ts"

/** Hands a (possibly transformed) value on to the next step, with the message that caused it. */
export type Emit = (value: Value, cause: Cause) => void

/** One step of a wire. Stateless steps call next synchronously; timed steps call it later. */
export interface Transform extends DisposableLike {
  /** Receives a value; calls `next` zero or more times, now or later. Timed steps keep the cause of the value they emit. */
  push(value: Value, cause: Cause, next: Emit): void
}

/** Base for steps without state or timers. */
export abstract class StatelessTransform implements Transform {
  /** @returns the value passed on; must not throw for any Value (conversions never throw) */
  push(value: Value, cause: Cause, next: Emit) {
    next(this.apply(value), cause)
  }

  /** nothing to release */
  dispose() {}

  protected abstract apply(value: Value): Value
}
