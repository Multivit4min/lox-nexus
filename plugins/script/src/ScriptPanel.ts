import type { Panel } from "@lox-nexus/plugin-sdk"
import { ValueFormatter } from "@lox-nexus/plugin-sdk/values"
import type { ScriptState } from "./run/ScriptState.ts"
import type { VariableRecord, VariableTable } from "./variables/VariableTable.ts"

/**
 * Two sections: the script's state with its last uncaught error, and a table with a row per
 * variable and direction. Counters live in memory and start at zero with every start.
 */
export class ScriptPanel {
  static readonly columns = ["Variable", "Direction", "Signals", "Last value", "Calls", "Last call"]
  private static readonly directions = { set: "from script (set)", receive: "to script (on, get)" }
  private readonly formatter = new ValueFormatter()

  constructor(
    private readonly state: ScriptState,
    private readonly table: VariableTable,
    private readonly timers: () => number,
    private readonly timeZone: string
  ) {}

  build(): Panel {
    const rows = this.table.all().map(record => this.variableRow(record))
    return {
      type: "sections",
      sections: [
        { title: "Script", panel: { type: "keyValue", items: this.stateItems() } },
        { title: "Variables", panel: { type: "table", columns: ScriptPanel.columns, rows } }
      ]
    }
  }

  private stateItems() {
    const timers = this.timers()
    const running = `running, ${timers} ${timers === 1 ? "timer" : "timers"} active`
    const state = this.state.topLevel === "failed" ? `${running}; top level failed: ${this.state.topLevelError ?? ""}` : running
    const { lastError } = this.state
    return [
      { label: "State", value: state },
      { label: "Started", value: ScriptPanel.time(this.state.startedAt) },
      { label: "Time zone", value: this.timeZone },
      { label: "Uncaught errors", value: String(this.state.errors) },
      ...(lastError ? [{ label: "Last error", value: `${lastError.text} (${ScriptPanel.time(lastError.at)})` }] : [])
    ]
  }

  private variableRow(record: VariableRecord) {
    const value = record.value ? this.formatter.format(record.value) : ""
    return [record.name, ScriptPanel.directions[record.direction], String(record.signals), value, String(record.calls), ScriptPanel.time(record.lastAt)]
  }

  private static time(at: number | undefined) {
    return at === undefined ? "never" : new Date(at).toISOString()
  }
}
