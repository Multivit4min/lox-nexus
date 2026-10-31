import { Value, ValueFormatter, ValueSchema } from "@lox-nexus/plugin-sdk/values"
import { z } from "zod"
import { HttpError } from "../../../http/HttpError.ts"
import type { InventoryService, InventorySignal } from "../../../services/InventoryService.ts"

/** a value as agents give it: a plain number, boolean or text, or a full value for lights and T5 */
export const ValueInput = z.union([z.number(), z.boolean(), z.string().max(10_000), ValueSchema])
  .describe("21.5, true or \"text\"; for lights a value like {type:\"rgbw\", value:{red, green, blue, white, fadeTime, flags}}")

/** Turns what an agent names and gives into a signal and a value of its type. */
export class OperateValues {
  private readonly formatter = new ValueFormatter()

  constructor(private readonly inventory: Pick<InventoryService, "find">) {}

  /** @throws HttpError 404 */
  signal(ref: string): InventorySignal {
    const signal = this.inventory.find(ref)
    if (!signal) throw HttpError.notFound(`signal "${ref}" (list_signals names them)`)
    return signal
  }

  /**
   * the value as the signal's type takes it; a mismatch is refused rather than converted, since a
   * device acting on a guessed value is worse than a question
   * @throws HttpError 400
   */
  value(signal: InventorySignal, input: z.infer<typeof ValueInput>): Value {
    const value = typeof input === "number" ? Value.number(input) : typeof input === "boolean" ? Value.boolean(input) : typeof input === "string" ? Value.string(input) : input
    if (signal.valueType !== "any" && value.type !== signal.valueType) {
      throw HttpError.badRequest(`${signal.topic} takes ${signal.valueType} values, not ${value.type}`)
    }
    return value
  }

  format(value: Value, signal: InventorySignal) {
    return `${this.formatter.format(value, { decimals: signal.decimals })}${signal.unit && value.type === "number" ? ` ${signal.unit}` : ""}`
  }
}
