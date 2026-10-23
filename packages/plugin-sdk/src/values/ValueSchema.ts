import { z } from "zod"
import type { Value } from "./Value.ts"

/** whole percent, the resolution of the Loxone wire format */
const percent = z.int().min(0).max(100)
/** the wire carries tenths of a second in a uint16 */
const seconds = z.number().min(0).max(6553.5)

/**
 * Validates values arriving from untrusted places (workers, HTTP, persisted data). Everything it
 * accepts can be encoded for a Miniserver: no NaN or Infinity, whole percent channels, and
 * ranges that fit the wire fields.
 */
export const ValueSchema: z.ZodType<Value> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("null") }),
  z.object({ type: z.literal("boolean"), value: z.boolean() }),
  z.object({ type: z.literal("number"), value: z.number() }),
  z.object({ type: z.literal("string"), value: z.string() }),
  z.object({ type: z.literal("singleChannel"), value: z.object({ channel: percent, fadeTime: seconds }) }),
  z.object({ type: z.literal("rgbw"), value: z.object({
    red: percent, green: percent, blue: percent, white: percent, fadeTime: seconds, flags: z.int().min(0).max(0xffff)
  }) }),
  z.object({ type: z.literal("tunableWhite"), value: z.object({ temperature: z.int().min(0).max(0xffff), brightness: percent, fadeTime: seconds }) }),
  z.object({ type: z.literal("t5"), value: z.object({ buttons: z.int().min(0).max(31) }) })
])

/** Validates just the type name, for example for a signal declaration. */
export const ValueTypeSchema = z.enum(["null", "boolean", "number", "string", "singleChannel", "rgbw", "tunableWhite", "t5"])
