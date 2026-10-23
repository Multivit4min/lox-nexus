import { Converter, Numbers, Value } from "@lox-nexus/plugin-sdk/values"
import { StatelessTransform } from "./Transform.ts"

/** Maps a number linearly from one range to another, e.g. 0–100 % to 0–255. */
export class ScaleTransform extends StatelessTransform {
  /** @param clamp keep the result inside `to` even when the input lies outside `from` (default: extrapolate) */
  constructor(
    private readonly from: readonly [number, number],
    private readonly to: readonly [number, number],
    private readonly clamp = false
  ) {
    super()
  }

  protected apply(value: Value): Value {
    const input = Converter.convert(value, "number").value
    const scaled = Numbers.scale(input, this.from[0], this.from[1], this.to[0], this.to[1])
    if (!this.clamp) return Value.number(scaled)
    return Value.number(Numbers.clamp(scaled, Math.min(...this.to), Math.max(...this.to)))
  }
}
