import type { DisposableLike } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { Cause } from "../../bus/BusMessage.ts"
import type { Emit, Transform } from "./Transform.ts"

/** Chains transforms; the last step hands the value to `deliver`. */
export class TransformPipeline implements DisposableLike {
  private readonly entry: Emit

  constructor(private readonly transforms: readonly Transform[], deliver: Emit) {
    this.entry = transforms.reduceRight<Emit>((next, transform) => (value, cause) => transform.push(value, cause, next), deliver)
  }

  push(value: Value, cause: Cause) {
    this.entry(value, cause)
  }

  dispose() {
    for (const transform of this.transforms) void transform.dispose()
  }
}
