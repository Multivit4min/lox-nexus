import { z } from "@lox-nexus/plugin-sdk"

/** which text of an event `match` looks at; `summary` is what calendars show as the title */
export const fieldSchema = z.enum(["summary", "description", "location", "any"])

const fieldLabels = { summary: "Title", description: "Description", location: "Location", any: "Title, description or location" }

/** The filter every sensor and the dismiss actuator share: which events count, and when. */
export class FilterParams {
  /** a day: dismissals and the occurrences read from the feed are kept that long after the end */
  static readonly MAX_LAG_MINUTES = 1440
  static readonly MAX_LEAD_MINUTES = 43_200

  static readonly shape = {
    match: z.string().min(1).optional().meta({
      title: "Text to look for", description: "Only events whose text contains this, ignoring case. Empty: every event"
    }),
    field: fieldSchema.default("summary").meta({
      title: "Look in", description: "Which text of the event to search", enumLabels: fieldLabels
    }),
    regex: z.boolean().default(false).meta({
      title: "Regular expression", description: "Read the text to look for as a regular expression (ignoring case), e.g. ^(Paper|Plastic)$"
    }),
    leadMinutes: z.number().min(0).max(FilterParams.MAX_LEAD_MINUTES).default(0).meta({
      title: "Minutes before the start", description: "The event counts as active this many minutes before it starts (up to 30 days)"
    }),
    lagMinutes: z.number().min(0).max(FilterParams.MAX_LAG_MINUTES).default(0).meta({
      title: "Minutes after the end", description: "The event stays active this many minutes after it ends (up to a day)"
    })
  }

  /** the filter params plus a capability's own, refusing a regular expression that doesn't compile */
  static schema<Extra extends z.ZodRawShape>(extra: Extra) {
    return z.object({ ...FilterParams.shape, ...extra }).refine(
      // zod can't see the shared fields through the generic spread, so the check names them itself
      params => FilterParams.valid(params as Pick<Filter, "regex" | "match">),
      { message: "the text to look for is not a valid regular expression", path: ["match"] }
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
