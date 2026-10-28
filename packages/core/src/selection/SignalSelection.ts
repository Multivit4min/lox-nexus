import type { Signal } from "../wires/Signal.ts"

/** "all": every signal unless a rule excludes it; "selected": only what a rule includes */
export type SelectionMode = "all" | "selected"

/** What a rule names: one signal, or every signal of a Miniserver or plugin instance. */
export type SelectionTarget = { signalId: string } | { miniserverId: string } | { instanceId: string }

/** Includes or excludes its target, overriding the mode. */
export interface SelectionRule {
  target: SelectionTarget
  include: boolean
}

/**
 * Which signals a consumer (the history, an exporting plugin) takes. A rule on the signal decides
 * first, then a rule on its owner, then the mode; so "all, except this Miniserver, but this one
 * signal of it" works. Keyed by ids, which survive renames. Immutable: build a new one when the
 * rules change.
 */
export class SignalSelection {
  private readonly signals = new Map<string, boolean>()
  private readonly owners = new Map<string, boolean>()

  constructor(readonly mode: SelectionMode, readonly rules: readonly SelectionRule[] = []) {
    for (const { target, include } of rules) {
      if ("signalId" in target) this.signals.set(target.signalId, include)
      else if ("miniserverId" in target) this.owners.set(SignalSelection.owner("miniserver", target.miniserverId), include)
      else this.owners.set(SignalSelection.owner("plugin", target.instanceId), include)
    }
  }

  /** selects nothing; the default of every consumer until the user chooses */
  static readonly NONE = new SignalSelection("selected")

  includes(signal: Pick<Signal, "id" | "owner">): boolean {
    const own = this.signals.get(signal.id)
    if (own !== undefined) return own
    const byOwner = signal.owner ? this.owners.get(SignalSelection.owner(signal.owner.kind, signal.owner.id)) : undefined
    return byOwner ?? this.mode === "all"
  }

  private static owner(kind: string, id: string) {
    return `${kind} ${id}`
  }
}
