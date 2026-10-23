import type { TransformConfig } from "../WireSchema.ts"
import { ConvertTransform } from "./ConvertTransform.ts"
import { DebounceTransform } from "./DebounceTransform.ts"
import { InvertTransform } from "./InvertTransform.ts"
import { MapTransform } from "./MapTransform.ts"
import { ScaleTransform } from "./ScaleTransform.ts"
import { ThrottleTransform } from "./ThrottleTransform.ts"
import type { Transform } from "./Transform.ts"

/** Builds the transform class for a validated config; the switch is exhaustive, so a new op fails typecheck until handled. */
export class TransformFactory {
  create(config: TransformConfig): Transform {
    switch (config.op) {
      case "invert": return new InvertTransform()
      case "scale": return new ScaleTransform(config.from, config.to, config.clamp)
      case "map": return new MapTransform(config.cases, config.else)
      case "debounce": return new DebounceTransform(config.ms)
      case "throttle": return new ThrottleTransform(config.ms)
      case "convert": return new ConvertTransform(config.to)
    }
  }
}
