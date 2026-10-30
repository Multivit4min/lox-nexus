import { z } from "zod"

/**
 * How a signal's numbers are shown, in signal inputs: a unit after the value and the decimals to
 * round to. The same rules as core's SignalDisplaySchema, which the server applies again; declared
 * here because the browser can't load core.
 */
export const SignalDisplayInputSchema = z.object({
  // empty means none
  unit: z.string().trim().max(16).transform(unit => (unit === "" ? undefined : unit)).optional(),
  decimals: z.int().min(0).max(6).optional()
})

/** How a signal's numbers are shown, in signal DTOs; absent fields are not set. */
export interface SignalDisplayDto {
  /** shown after the value, e.g. "W" */
  unit?: string
  /** decimals numbers are rounded to for display */
  decimals?: number
}
