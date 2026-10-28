import type { Panel } from "@lox-nexus/plugin-sdk"
import { ValueFormatter } from "@lox-nexus/plugin-sdk/values"
import type { ScriptState } from "./run/ScriptState.ts"
import type { VariableRecord, VariableTable } from "./variables/VariableTable.ts"

/**
 * One table: the script's state and its last uncaught error first, then a row per variable and
 * direction. The SDK's panel is a single table or key-value list, so the state is rows of the
 * same table. Counters live in memory and start at zero with every start.
 */
export class ScriptPanel {
  static readonly columns = ["Variable", "Direction", "Signals", "Last value", "Calls", "Last call"]
  private static readonly directions = { set: "from script (set)", receive: "to script (on, get)" }
  private readonly formatter = new ValueFormatter()

  constructor(private readonly state: ScriptState, private readonly table: VariableTable, private readonly timers: () => number) {}

  build(): Panel {
    const rows = [this.stateRow()]
    const { lastError } = this.state
    if (lastError) rows.push(["(last error)", "", "", lastError.text, String(this.state.errors), ScriptPanel.time(lastError.at)])
    rows.push(...this.table.all().map(record => this.variableRow(record)))
    return { type: "table", columns: ScriptPanel.columns, rows }
  }

  private stateRow() {
    const timers = this.timers()
    const running = `running, ${timers} ${timers === 1 ? "timer" : "timers"} active`
    const text = this.state.topLevel === "failed" ? `${running}; top level failed: ${this.state.topLevelError ?? ""}` : running
    return ["(script)", "", "", text, "", ScriptPanel.time(this.state.startedAt)]
  }

  private variableRow(record: VariableRecord) {
    const value = record.value ? this.formatter.format(record.value) : ""
    return [record.name, ScriptPanel.directions[record.direction], String(record.signals), value, String(record.calls), ScriptPanel.time(record.lastAt)]
  }

  private static time(at: number | undefined) {
    return at === undefined ? "never" : new Date(at).toISOString()
  }
}
