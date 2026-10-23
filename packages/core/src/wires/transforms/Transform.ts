import type { DisposableLike } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { Cause } from "../../bus/BusMessage.ts"

export type Emit = (value: Value, cause: Cause) => void

/** One step of a wire. Stateless steps call next synchronously; timed steps call it later. */
export interface Transform extends DisposableLike {
  push(value: Value, cause: Cause, next: Emit): void
}

/** Base for steps without state or timers. */
export abstract class StatelessTransform implements Transform {
  push(value: Value, cause: Cause, next: Emit) {
    next(this.apply(value), cause)
  }

  dispose() {}

  protected abstract apply(value: Value): Value
}
