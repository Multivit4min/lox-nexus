import type { ConfigExport } from "@lox-nexus/api"
import type { ConfigDocument } from "./ConfigCheck.ts"
import type { SelectionService } from "./SelectionService.ts"

type Selection = NonNullable<NonNullable<ConfigExport["selections"]>["history"]>
type Rule = Selection["rules"][number]
type Step = (where: string, work: () => unknown) => Promise<boolean>

/** the consumer whose selection travels with the file */
const HISTORY = "history"

/** Which signals the history records, in a config export and back. */
export class HistorySelectionTransfer {
  constructor(private readonly selections: Pick<SelectionService, "of" | "setMode" | "setRules"> | undefined) {}

  /** only rules on what the file contains (its signals, Miniservers and plugin instances) */
  export(ids: ReadonlySet<string>): Selection | undefined {
    const selection = this.selections?.of(HISTORY)
    return selection && { mode: selection.mode, rules: HistorySelectionTransfer.within(selection.rules, ids) }
  }

  /** the rules whose target is one of `ids`, as the file writes them */
  static within(rules: ReadonlyArray<{ target: Rule["target"]; include: boolean }>, ids: ReadonlySet<string>): Rule[] {
    return rules.flatMap(({ target, include }) => (ids.has(HistorySelectionTransfer.idOf(target)) ? [{ target: { ...target }, include }] : []))
  }

  static idOf(target: Rule["target"]) {
    return "signalId" in target ? target.signalId : "miniserverId" in target ? target.miniserverId : target.instanceId
  }

  /**
   * The rules went with the removed signals; rules on ids the file doesn't have are skipped. While
   * restoring (`oneByOne`), one at a time: a signal that didn't come back must not cost the others' rules.
   */
  async import(doc: ConfigDocument, history: Selection, step: Step, oneByOne: boolean) {
    const selections = this.selections
    if (!selections) return
    const ids = new Set([
      ...doc.miniservers.flatMap(ms => [ms.id, ...ms.signals.map(signal => signal.id)]),
      ...(doc.plugins ?? []).flatMap(plugin => [plugin.id, ...plugin.signals.map(signal => signal.id)])
    ])
    const known = HistorySelectionTransfer.within(history.rules, ids)
    await step("selections.history", () => selections.setMode(HISTORY, history.mode))
    const batches = oneByOne ? known.map(rule => [rule]) : [known]
    for (const batch of batches) if (batch.length > 0) await step("selections.history", () => selections.setRules(HISTORY, batch))
  }
}
