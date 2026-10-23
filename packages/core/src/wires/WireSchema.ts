import { ValueSchema, ValueTypeSchema } from "@lox-nexus/plugin-sdk/values"
import { z } from "zod"

const range = z.tuple([z.number(), z.number()]).refine(([a, b]) => a !== b, "range must not be empty")

export const TransformSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("invert") }),
  z.object({ op: z.literal("scale"), from: range, to: z.tuple([z.number(), z.number()]), clamp: z.boolean().optional() }),
  z.object({ op: z.literal("map"), cases: z.array(z.object({ when: ValueSchema, then: ValueSchema })), else: ValueSchema.optional() }),
  z.object({ op: z.literal("debounce"), ms: z.int().positive() }),
  z.object({ op: z.literal("throttle"), ms: z.int().positive() }),
  z.object({ op: z.literal("convert"), to: ValueTypeSchema })
])

/** Wires come from the database and the API, so they are validated before use. */
export const WireSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  transforms: z.array(TransformSchema).default([]),
  enabled: z.boolean().default(true),
  /** forward values restored from the snapshot at startup (default: only live changes) */
  syncOnStart: z.boolean().default(false)
})

export type TransformConfig = z.infer<typeof TransformSchema>
export type WireConfig = z.infer<typeof WireSchema>
export type WireInput = z.input<typeof WireSchema>
