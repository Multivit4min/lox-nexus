import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { Cause } from "../../bus/BusMessage.ts"
import type { Emit, Transform } from "./Transform.ts"

/** Emits the latest value once nothing new arrived for `ms`. */
export class DebounceTransform implements Transform {
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly ms: number) {}

  push(value: Value, cause: Cause, next: Emit) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      next(value, cause)
    }, this.ms)
  }

  dispose() {
    clearTimeout(this.timer)
    this.timer = undefined
  }
}
