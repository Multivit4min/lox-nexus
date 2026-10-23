import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { Cause } from "../../bus/BusMessage.ts"
import type { Emit, Transform } from "./Transform.ts"

/** Emits the latest value once nothing new arrived for `ms` (milliseconds); earlier values are discarded, and the cause is that of the latest value. */
export class DebounceTransform extends Disposable implements Transform {
  private cancel: (() => void) | undefined

  constructor(private readonly ms: number) {
    super()
  }

  push(value: Value, cause: Cause, next: Emit) {
    this.cancel?.()
    this.cancel = this.after(this.ms, () => {
      this.cancel = undefined
      next(value, cause)
    })
  }
}
