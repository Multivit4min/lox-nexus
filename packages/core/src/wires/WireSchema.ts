import { ValueSchema, ValueTypeSchema } from "@lox-nexus/plugin-sdk/values"
import { z } from "zod"

/** two different numbers, since a scale from an empty range would divide by zero */
const range = z.tuple([z.number(), z.number()]).refine(([a, b]) => a !== b, "range must not be empty")
/** one day; longer delays make no sense for a wire and would overflow setTimeout beyond ~24.8 days */
const delay = z.int().positive().max(86_400_000)

/** One step of a wire, discriminated by `op`. Ranges for `scale` are [min, max] pairs and `from` must not be empty. */
export const TransformSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("invert") }),
  z.object({ op: z.literal("scale"), from: range, to: z.tuple([z.number(), z.number()]), clamp: z.boolean().optional() }),
  z.object({ op: z.literal("map"), cases: z.array(z.object({ when: ValueSchema, then: ValueSchema })), else: ValueSchema.optional() }),
  z.object({ op: z.literal("debounce"), ms: delay }),
  z.object({ op: z.literal("throttle"), ms: delay }),
  z.object({ op: z.literal("convert"), to: ValueTypeSchema })
])

/** Wires come from the database and the API, so they are validated before use. */
export const WireSchema = z.object({
  id: z.string().min(1),
  /** shown in the inspector and in loop warnings */
  label: z.string().max(200),
  /** Signal id of the source; resolved by WireEngine, not validated here */
  sourceId: z.string().min(1),
  /** Signal id of the target; each target can have at most one wire */
  targetId: z.string().min(1),
  /** applied in order before the value is converted to the target's type */
  transforms: z.array(TransformSchema).max(50).default([]),
  /** a disabled wire stays registered but forwards nothing */
  enabled: z.boolean().default(true),
  /** forward values restored from the snapshot at startup (default: only live changes) */
  syncOnStart: z.boolean().default(false)
})

/** A parsed transform step (defaults applied). */
export type TransformConfig = z.infer<typeof TransformSchema>
/** A parsed wire (defaults applied). */
export type WireConfig = z.infer<typeof WireSchema>
/** What callers may pass in: fields with defaults are optional. */
export type WireInput = z.input<typeof WireSchema>
