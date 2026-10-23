import type { DisposableLike } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { Cause } from "../../bus/BusMessage.ts"
import type { Emit, Transform } from "./Transform.ts"

/** Chains transforms; the last step hands the value to `deliver`. An empty chain delivers directly. */
export class TransformPipeline implements DisposableLike {
  private readonly entry: Emit

  constructor(private readonly transforms: readonly Transform[], deliver: Emit) {
    this.entry = transforms.reduceRight<Emit>((next, transform) => (value, cause) => transform.push(value, cause, next), deliver)
  }

  /** Feeds a value into the first step. Timed steps may deliver later, after push() returned. */
  push(value: Value, cause: Cause) {
    this.entry(value, cause)
  }

  /**
   * disposes every step, which cancels pending debounce and throttle timers
   * @throws AggregateError if any step failed to dispose, after all steps were disposed
   */
  async dispose() {
    const results = await Promise.allSettled(this.transforms.map(async transform => transform.dispose()))
    const errors = results.flatMap(result => (result.status === "rejected" ? [result.reason as unknown] : []))
    if (errors.length > 0) throw new AggregateError(errors, "transforms failed to dispose")
  }
}
