import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { Cause } from "../../bus/BusMessage.ts"
import type { Emit, Transform } from "./Transform.ts"

/** Emits immediately, then at most once per `ms`; the latest value of a window is emitted at its end. */
export class ThrottleTransform implements Transform {
  private window: NodeJS.Timeout | undefined
  private pending: { value: Value; cause: Cause; next: Emit } | undefined

  constructor(private readonly ms: number) {}

  push(value: Value, cause: Cause, next: Emit) {
    if (this.window) {
      this.pending = { value, cause, next }
      return
    }
    next(value, cause)
    this.openWindow()
  }

  dispose() {
    clearTimeout(this.window)
    this.window = undefined
    this.pending = undefined
  }

  private openWindow() {
    this.window = setTimeout(() => {
      this.window = undefined
      const pending = this.pending
      this.pending = undefined
      if (pending) this.push(pending.value, pending.cause, pending.next)
    }, this.ms)
  }
}
