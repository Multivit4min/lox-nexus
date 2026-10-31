import { z } from "zod"
import type { InventoryService, InventorySignal } from "../../services/InventoryService.ts"
import { CompactTable } from "../CompactTable.ts"
import type { McpTool } from "../McpTool.ts"
import { SignalTable } from "../SignalTable.ts"

const Input = z.object({
  owner: z.string().max(120).optional().describe("\"miniserver:<slug>\" or \"plugin:<slug>\", as overview names them"),
  direction: z.enum(["in", "out", "sensor", "actuator"]).optional().describe("in: the Miniserver sends it; out: Nexus sends it to the Miniserver"),
  valueType: z.string().max(40).optional(),
  search: z.string().max(100).optional().describe("words that must all appear in the topic, label, packet id or capability"),
  unwired: z.boolean().optional().describe("only signals without a wire"),
  forced: z.boolean().optional(),
  stale: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  cursor: z.string().max(20).optional()
})
type Input = z.infer<typeof Input>

/** Signals filtered, as the overview's table, a page at a time. */
export class ListSignalsTool implements McpTool<Input> {
  readonly name = "list_signals"
  readonly title = "List signals"
  readonly description = "Signals as a table (topic, label, owner, direction, type, packet id and data type or capability, value, wires, flags), filtered by owner, direction, value type, text, unwired, forced or stale. Pages of `limit`; pass `next` as `cursor` for more."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input

  constructor(private readonly inventory: Pick<InventoryService, "signals">) {}

  run(input: Input) {
    const matching = this.inventory.signals().filter(signal => ListSignalsTool.matches(signal, input))
    const page = CompactTable.page(matching, input.limit, input.cursor)
    return { ...SignalTable.of(page.items), total: page.total, ...(page.next ? { next: page.next } : {}) }
  }

  private static matches(signal: InventorySignal, input: Input) {
    const words = (input.search ?? "").toLowerCase().split(/\s+/).filter(Boolean)
    const text = [signal.topic, signal.label, signal.packetId, signal.capability].filter(Boolean).join(" ").toLowerCase()
    return (!input.owner || signal.owner === input.owner)
      && (!input.direction || signal.dir === input.direction)
      && (!input.valueType || signal.valueType === input.valueType)
      && (!input.unwired || signal.wires === 0)
      && (input.forced === undefined || signal.forced === input.forced)
      && (input.stale === undefined || signal.stale === input.stale)
      && words.every(word => text.includes(word))
  }
}
