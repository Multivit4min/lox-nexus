import type { CatalogEntry, CatalogNode } from "@lox-nexus/plugin-sdk"
import { Converter, type Value } from "@lox-nexus/plugin-sdk/values"
import type { VariableRecord, VariableTable } from "./variables/VariableTable.ts"

type Kind = { capability: "number"; type: "number" } | { capability: "switch"; type: "boolean" } | { capability: "text"; type: "string" }

/**
 * The names the script used while running, as ready-made signals: names given to `nexus.set`
 * become sensors, names given to `nexus.on` or `nexus.get` actuators. The type follows the last
 * value (number, switch, else text); an actuator that hasn't received anything yet is offered as
 * a number, the most common value from Loxone.
 */
export class ScriptCatalog {
  constructor(private readonly table: VariableTable) {}

  build(): CatalogNode[] {
    const used = this.table.all().filter(record => record.used)
    const nodes: CatalogNode[] = [
      { label: "From the script (nexus.set)", entries: used.filter(record => record.direction === "set").map(record => ScriptCatalog.entry("sensor", record)) },
      { label: "To the script (nexus.on, nexus.get)", entries: used.filter(record => record.direction === "receive").map(record => ScriptCatalog.entry("actuator", record)) }
    ]
    return nodes.filter(node => (node.entries?.length ?? 0) > 0)
  }

  private static entry(kind: "sensor" | "actuator", record: VariableRecord): CatalogEntry {
    const { capability, type } = ScriptCatalog.kind(record.value)
    const entry: CatalogEntry = { kind, capability, params: { name: record.name }, label: record.name }
    if (record.value) entry.value = Converter.convert(record.value, type)
    return entry
  }

  private static kind(value: Value | undefined): Kind {
    if (value === undefined || value.type === "number") return { capability: "number", type: "number" }
    if (value.type === "boolean") return { capability: "switch", type: "boolean" }
    return { capability: "text", type: "string" }
  }
}
