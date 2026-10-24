import { Converter, type Value, type ValueType } from "@lox-nexus/plugin-sdk/values"
import type { Cause } from "../bus/BusMessage.ts"
import { StatelessTransform } from "./transforms/Transform.ts"
import { TransformFactory } from "./transforms/TransformFactory.ts"
import type { TransformConfig } from "./WireSchema.ts"

/** One transform of a previewed wire and the value it hands on. */
export interface PreviewStep {
  op: TransformConfig["op"]
  value: Value
  /** for timed steps: they pass the value on later, which a single value can't show */
  note?: string
}

/** What a wire would do with one value. */
export interface WirePreviewResult {
  steps: PreviewStep[]
  /** the value the target gets, after the conversion to its type */
  delivered: Value
}

const PREVIEW: Cause = { id: "preview", traceId: "preview", depth: 0 }

/**
 * Runs one value through a wire's transforms and the conversion to the target's type, the same
 * classes ActiveWire uses, without touching the bus. Debounce and throttle only change timing, so
 * they pass the value through with a note instead of starting timers.
 */
export class WirePreview {
  private readonly factory = new TransformFactory()

  run(value: Value, transforms: readonly TransformConfig[], targetType: ValueType | "any"): WirePreviewResult {
    let current = value
    const steps = transforms.map(config => {
      const step = this.step(config, current)
      current = step.value
      return step
    })
    return { steps, delivered: targetType === "any" ? current : Converter.convert(current, targetType) }
  }

  private step(config: TransformConfig, value: Value): PreviewStep {
    if (config.op === "debounce") return { op: config.op, value, note: `passed on once nothing new arrived for ${config.ms} ms` }
    if (config.op === "throttle") return { op: config.op, value, note: `at most one value per ${config.ms} ms` }
    // the remaining steps must be stateless: they answer at once and hold nothing to dispose
    const transform = this.factory.create(config)
    if (!(transform instanceof StatelessTransform)) throw new Error(`a "${config.op}" step can't be previewed`)
    let out: Value | undefined
    transform.push(value, PREVIEW, next => (out = next))
    if (!out) throw new Error(`a "${config.op}" step passed nothing on`)
    return { op: config.op, value: out }
  }
}
