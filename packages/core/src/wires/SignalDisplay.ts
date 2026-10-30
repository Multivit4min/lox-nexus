import { z } from "zod"

/**
 * How a signal's numbers are shown: a unit after the value ("W", "°C") and the decimals to round
 * to. Only for display; values on the bus stay exact. Shared by Loxone and plugin signals.
 */
export const SignalDisplaySchema = z.object({
  /** shown after the value; empty means none */
  unit: z.string().trim().max(16).transform(unit => (unit === "" ? undefined : unit)).optional(),
  /** decimals to show for numbers; absent: as many as the value has */
  decimals: z.int().min(0).max(6).optional()
})
export type SignalDisplay = z.infer<typeof SignalDisplaySchema>

/** Picks the display fields of a signal's config, leaving out what isn't set. */
export class SignalDisplays {
  static of(source: SignalDisplay): SignalDisplay {
    return { ...(source.unit ? { unit: source.unit } : {}), ...(source.decimals === undefined ? {} : { decimals: source.decimals }) }
  }
}
