import { z } from "@lox-nexus/plugin-sdk"

/** which text of an event `match` looks at */
export const fieldSchema = z.enum(["summary", "description", "location", "any"])

/** The filter every sensor and the dismiss actuator share: which events count, and when. */
export class FilterParams {
  /** a day: dismissals and the occurrences read from the feed are kept that long after the end */
  static readonly MAX_LAG_MINUTES = 1440
  static readonly MAX_LEAD_MINUTES = 43_200

  static readonly shape = {
    match: z.string().min(1).optional()
      .describe("Only events whose text contains this (ignoring case); empty: every event"),
    field: fieldSchema.default("summary").describe("Where to look for `match`"),
    regex: z.boolean().default(false).describe("Treat `match` as a regular expression (ignoring case)"),
    leadMinutes: z.number().min(0).max(FilterParams.MAX_LEAD_MINUTES).default(0)
      .describe("An event counts as active this many minutes before it starts"),
    lagMinutes: z.number().min(0).max(FilterParams.MAX_LAG_MINUTES).default(0)
      .describe("An event stays active this many minutes after it ends (at most a day)")
  }

  /** the filter params plus a capability's own, refusing a regular expression that doesn't compile */
  static schema<Extra extends z.ZodRawShape>(extra: Extra) {
    return z.object({ ...FilterParams.shape, ...extra }).refine(
      // zod can't see the shared fields through the generic spread, so the check names them itself
      params => FilterParams.valid(params as Pick<Filter, "regex" | "match">),
      { message: "`match` is not a valid regular expression", path: ["match"] }
    )
  }

  private static valid({ regex, match }: Pick<Filter, "regex" | "match">) {
    if (!regex || match === undefined) return true
    try {
      new RegExp(match, "i")
      return true
    } catch {
      return false
    }
  }
}

/** the filter params as sensors and actuators receive them, defaults applied */
export type Filter = z.output<z.ZodObject<typeof FilterParams.shape>>
