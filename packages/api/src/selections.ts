import { z } from "zod"

const id = z.string().min(1).max(200)

/** "all": every signal unless a rule excludes it; "selected": only what a rule includes */
export const SelectionModeSchema = z.enum(["all", "selected"])
export type SelectionModeDto = z.infer<typeof SelectionModeSchema>

/** One signal, or every signal of a Miniserver or plugin instance. */
export const SelectionTargetSchema = z.union([
  z.strictObject({ signalId: id }),
  z.strictObject({ miniserverId: id }),
  z.strictObject({ instanceId: id })
])
export type SelectionTargetDto = z.infer<typeof SelectionTargetSchema>

/** A rule overrides the mode for its target: a rule on a signal beats one on its owner. */
export interface SelectionRuleDto {
  target: SelectionTargetDto
  include: boolean
}

/** GET /api/selections/:consumer. Consumers: "history" (and, later, plugin instances that watch signals). */
export interface SelectionDto {
  consumer: string
  mode: SelectionModeDto
  rules: SelectionRuleDto[]
}

/** PUT /api/selections/:consumer/mode */
export const SelectionModeUpdateSchema = z.object({ mode: SelectionModeSchema })

/** PUT /api/selections/:consumer/rules: sets several rules at once; `include: null` removes a target's rule. */
export const SelectionRulesUpdateSchema = z.array(z.object({ target: SelectionTargetSchema, include: z.boolean().nullable() })).min(1).max(10_000)
export type SelectionRulesUpdate = z.input<typeof SelectionRulesUpdateSchema>
