import type { SelectionDto, SignalOwnerDto } from "@lox-nexus/api"

/** The server's rule (core SignalSelection), for showing what a selection takes: the signal's own rule, then its owner's, then the mode. */
export class SelectionRules {
  static includes(selection: SelectionDto, signal: { id: string; owner?: SignalOwnerDto }) {
    const own = selection.rules.find(({ target }) => "signalId" in target && target.signalId === signal.id)
    if (own) return own.include
    const owner = signal.owner
    const byOwner = owner && selection.rules.find(({ target }) =>
      owner.kind === "miniserver" ? "miniserverId" in target && target.miniserverId === owner.id : "instanceId" in target && target.instanceId === owner.id)
    return byOwner ? byOwner.include : selection.mode === "all"
  }
}
