import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { Cause } from "../../bus/BusMessage.ts"
import type { Emit, Transform } from "./Transform.ts"

/** Emits immediately, then at most once per `ms`; the latest value of a window is emitted at its end. */
export class ThrottleTransform extends Disposable implements Transform {
  private windowOpen = false
  private pending: { value: Value; cause: Cause; next: Emit } | undefined

  constructor(private readonly ms: number) {
    super()
  }

  push(value: Value, cause: Cause, next: Emit) {
    if (this.windowOpen) {
      this.pending = { value, cause, next }
      return
    }
    next(value, cause)
    this.windowOpen = true
    this.after(this.ms, () => this.closeWindow())
  }

  private closeWindow() {
    this.windowOpen = false
    const pending = this.pending
    this.pending = undefined
    if (pending) this.push(pending.value, pending.cause, pending.next)
  }
}
