import type { SupportedTransformDto, TransformDto } from "@lox-nexus/api"
import { ValueFormatter, type ValueType } from "@lox-nexus/plugin-sdk/values"
import { ValueDraft } from "../ValueDraft.ts"

/** a value as typed: its type and its text (see ValueDraft) */
export interface ValueText {
  type: ValueType
  text: string
}

/** A transform step being edited: numbers and values stay text until parse(). */
export type StepDraft =
  | { op: "invert" }
  | { op: "scale"; from: [string, string]; to: [string, string]; clamp: boolean }
  | { op: "map"; cases: Array<{ when: ValueText; then: ValueText }>; otherwise?: ValueText }
  | { op: "debounce" | "throttle"; ms: string }
  | { op: "convert"; to: ValueType }

export type StepOp = StepDraft["op"]

/** labels and one-line explanations, in the order the "add step" menu shows them */
export const STEP_OPS: ReadonlyArray<{ op: StepOp; label: string; help: string }> = [
  { op: "scale", label: "Scale", help: "maps a number from one range to another, e.g. 0–100 % to 0–255" },
  { op: "invert", label: "Invert", help: "true becomes false and back; any value counts as a boolean first" },
  { op: "map", label: "Map", help: "replaces listed values; others become the fallback, or pass unchanged" },
  { op: "convert", label: "Convert", help: "turns the value into another type before the next step" },
  { op: "debounce", label: "Debounce", help: "waits until the value stays unchanged for a while, then passes the latest" },
  { op: "throttle", label: "Throttle", help: "passes at most one value per interval, always ending with the latest" }
]

const formatter = new ValueFormatter()

/** Converts between transform steps and their drafts, and names them for lists. */
export class TransformDraft {
  /** a new step with sensible defaults */
  static create(op: StepOp): StepDraft {
    switch (op) {
      case "invert": return { op }
      case "scale": return { op, from: ["0", "100"], to: ["0", "255"], clamp: false }
      case "map": return { op, cases: [{ when: { type: "number", text: "1" }, then: { type: "boolean", text: "true" } }] }
      case "debounce": return { op, ms: "500" }
      case "throttle": return { op, ms: "1000" }
      case "convert": return { op, to: "number" }
    }
  }

  static from(step: SupportedTransformDto): StepDraft {
    switch (step.op) {
      case "invert": case "convert": return { ...step }
      case "scale": return { op: "scale", from: [String(step.from[0]), String(step.from[1])], to: [String(step.to[0]), String(step.to[1])], clamp: step.clamp ?? false }
      case "map": return {
        op: "map", cases: step.cases.map(entry => ({ when: ValueDraft.from(entry.when), then: ValueDraft.from(entry.then) })),
        ...(step.else ? { otherwise: ValueDraft.from(step.else) } : {})
      }
      case "debounce": case "throttle": return { op: step.op, ms: String(step.ms) }
    }
  }

  /** @returns the step, or what to fix in words that fit under the step */
  static parse(draft: StepDraft): { step: SupportedTransformDto } | { error: string } {
    try {
      return { step: TransformDraft.build(draft) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** e.g. "scale 0…100 → 0…255", "debounce 500 ms" */
  static summary(step: TransformDto): string {
    switch (step.op) {
      case "invert": return "invert"
      case "scale": return `scale ${step.from[0]}…${step.from[1]} → ${step.to[0]}…${step.to[1]}${step.clamp ? " (clamped)" : ""}`
      case "map": return `map ${step.cases.map(entry => `${formatter.format(entry.when)}→${formatter.format(entry.then)}`).join(", ")}${step.else ? `, else ${formatter.format(step.else)}` : ""}`
      case "debounce": case "throttle": return `${step.op} ${step.ms} ms`
      case "convert": return `to ${step.to}`
      case "unsupported": return "unsupported step"
    }
  }

  // the limits mirror core's WireSchema; the server checks again, so a mismatch shows as its error
  private static build(draft: StepDraft): SupportedTransformDto {
    switch (draft.op) {
      case "invert": case "convert": return { ...draft }
      case "scale": {
        const from: [number, number] = [TransformDraft.number(draft.from[0], "from"), TransformDraft.number(draft.from[1], "from")]
        if (from[0] === from[1]) throw new Error("the input range must not be empty")
        const to: [number, number] = [TransformDraft.number(draft.to[0], "to"), TransformDraft.number(draft.to[1], "to")]
        return { op: "scale", from, to, ...(draft.clamp ? { clamp: true } : {}) }
      }
      case "map": {
        const cases = draft.cases.map((entry, i) => ({ when: TransformDraft.value(entry.when, `case ${i + 1}: if`), then: TransformDraft.value(entry.then, `case ${i + 1}: then`) }))
        return { op: "map", cases, ...(draft.otherwise ? { else: TransformDraft.value(draft.otherwise, "otherwise") } : {}) }
      }
      case "debounce": case "throttle": {
        const ms = TransformDraft.number(draft.ms, "time")
        if (!Number.isInteger(ms) || ms < 1 || ms > 86_400_000) throw new Error("time: whole milliseconds from 1 to 86400000 (one day)")
        return { op: draft.op, ms }
      }
    }
  }

  private static number(text: string, field: string) {
    const value = Number(text.trim().replace(",", "."))
    if (text.trim() === "" || !Number.isFinite(value)) throw new Error(`${field}: enter a number`)
    return value
  }

  private static value(draft: ValueText, field: string) {
    const parsed = ValueDraft.parse(draft.type, draft.text)
    if ("error" in parsed) throw new Error(`${field}: ${parsed.error}`)
    return parsed.value
  }
}
