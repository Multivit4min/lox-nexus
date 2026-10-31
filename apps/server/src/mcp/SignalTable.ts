import { ValueFormatter } from "@lox-nexus/plugin-sdk/values"
import type { InventorySignal } from "../services/InventoryService.ts"
import { CompactTable } from "./CompactTable.ts"

/** Signals as one table, the same in every tool: the value formatted with its unit, flags as words. */
export class SignalTable {
  private static readonly values = new ValueFormatter()

  static of(signals: readonly InventorySignal[]) {
    return CompactTable.of(signals, [
      ["topic", signal => signal.topic],
      ["label", signal => signal.label],
      ["owner", signal => signal.owner],
      ["dir", signal => signal.dir],
      ["type", signal => signal.valueType],
      ["packetId", signal => signal.packetId],
      ["dataType", signal => signal.dataType],
      ["capability", signal => signal.capability],
      ["value", signal => SignalTable.value(signal)],
      ["wires", signal => signal.wires || undefined],
      ["flags", signal => SignalTable.flags(signal)]
    ])
  }

  /** "21.5 °C"; empty while no value came */
  static value(signal: Pick<InventorySignal, "value" | "unit" | "decimals">) {
    if (!signal.value) return undefined
    const text = SignalTable.values.format(signal.value, { decimals: signal.decimals })
    return signal.unit ? `${text} ${signal.unit}` : text
  }

  static flags(signal: Pick<InventorySignal, "forced" | "stale" | "error">) {
    const flags = [signal.forced && "forced", signal.stale && "stale", signal.error && `error: ${signal.error}`].filter(Boolean)
    return flags.length ? flags.join(", ") : undefined
  }
}
