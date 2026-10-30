import { z } from "zod"

/**
 * How a signal is shown and watched: a unit after the value ("W", "°C"), the decimals to round
 * to, and after how long without a value it counts as stale. Never changes values on the bus.
 * Shared by Loxone and plugin signals.
 */
export const SignalDisplaySchema = z.object({
  /** shown after the value; empty means none */
  unit: z.string().trim().max(16).transform(unit => (unit === "" ? undefined : unit)).optional(),
  /** decimals to show for numbers; absent: as many as the value has */
  decimals: z.int().min(0).max(6).optional(),
  /** a source without a value (also an unchanged one) for this many minutes is stale; absent: never */
  staleAfterMin: z.int().min(1).max(10_080).optional()
})
export type SignalDisplay = z.infer<typeof SignalDisplaySchema>

/** Picks the display fields of a signal's config, leaving out what isn't set. */
export class SignalDisplays {
  /** only what shows a value: unit and decimals, for watching plugins and history charts */
  static format(source: SignalDisplay): Pick<SignalDisplay, "unit" | "decimals"> {
    const { unit, decimals } = SignalDisplays.of(source)
    return { ...(unit ? { unit } : {}), ...(decimals === undefined ? {} : { decimals }) }
  }

  static of(source: SignalDisplay): SignalDisplay {
    return {
      ...(source.unit ? { unit: source.unit } : {}), ...(source.decimals === undefined ? {} : { decimals: source.decimals }),
      ...(source.staleAfterMin === undefined ? {} : { staleAfterMin: source.staleAfterMin })
    }
  }
}
