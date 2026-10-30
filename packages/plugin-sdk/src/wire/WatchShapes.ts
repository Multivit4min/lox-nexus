import { z } from "zod"
import { ValueSchema, ValueTypeSchema } from "../values/ValueSchema.ts"

/**
 * What a plugin that watches signals declares (`static readonly watches`): shown to the user where
 * they choose the signals it receives.
 */
export const WatchDeclarationSchema = z.object({
  /** e.g. "Exported signals" */
  label: z.string().min(1).max(100),
  /** e.g. "Values of these signals are written to InfluxDB" */
  description: z.string().max(500).optional()
})
export type WatchDeclaration = z.infer<typeof WatchDeclarationSchema>

/** A signal the user chose for a watching plugin: any signal of Nexus, a Miniserver's or another plugin's. */
export const WatchedSignalSchema = z.object({
  id: z.string().min(1),
  /** its bus topic, e.g. loxone/home/in/temperature; changes when the signal or its owner is renamed */
  topic: z.string(),
  label: z.string(),
  valueType: z.union([ValueTypeSchema, z.literal("any")]),
  /** the Miniserver or plugin instance it belongs to */
  owner: z.object({ kind: z.enum(["miniserver", "plugin"]), id: z.string() }).optional(),
  /** the unit the user gave the signal, e.g. "W"; absent when none (and from older hosts) */
  unit: z.string().optional(),
  /** the decimals the user wants its numbers shown with; absent when not set */
  decimals: z.int().optional()
})
export type WatchedSignal = z.infer<typeof WatchedSignalSchema>

/** One value of a watched signal, as subscribers of the bus saw it. */
export const WatchedValueSchema = z.object({
  signalId: z.string().min(1),
  /** epoch ms */
  ts: z.number(),
  /** a state, or a command to an actuator */
  kind: z.enum(["state", "command"]),
  value: ValueSchema,
  /** a forced value, not what the device or Miniserver sent */
  forced: z.literal(true).optional(),
  /** the value the signal had when watching started (or the signal was chosen), not a change */
  initial: z.literal(true).optional()
})
export type WatchedValue = z.infer<typeof WatchedValueSchema>
