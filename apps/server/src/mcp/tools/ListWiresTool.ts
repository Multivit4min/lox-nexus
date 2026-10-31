import { z } from "zod"
import type { InventoryService } from "../../services/InventoryService.ts"
import { CompactTable } from "../CompactTable.ts"
import type { McpTool } from "../McpTool.ts"

const Input = z.object({
  signal: z.string().max(300).optional().describe("only wires from or to this signal (topic or id)"),
  owner: z.string().max(120).optional().describe("only wires touching a signal of this owner, e.g. \"plugin:<slug>\""),
  inactiveOnly: z.boolean().optional().describe("only wires that carry nothing, with the reason"),
  limit: z.number().int().min(1).max(500).default(100),
  cursor: z.string().max(20).optional()
})
type Input = z.infer<typeof Input>

/** Wires with both ends as topics, their transforms in short and why an inactive one carries nothing. */
export class ListWiresTool implements McpTool<Input> {
  readonly name = "list_wires"
  readonly title = "List wires"
  readonly description = "Wires as a table: label, source and target topics, the transform steps, whether it is enabled, and why an inactive one carries nothing. Filter by signal, owner or inactive only."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input

  constructor(private readonly inventory: Pick<InventoryService, "signals" | "wires" | "find">) {}

  run(input: Input) {
    const signals = this.inventory.signals()
    const byId = new Map(signals.map(signal => [signal.id, signal]))
    const only = input.signal === undefined ? undefined : this.inventory.find(input.signal, signals)?.id ?? "-"
    const matching = this.inventory.wires().filter(wire => (!only || wire.sourceId === only || wire.targetId === only)
      && (!input.owner || byId.get(wire.sourceId)?.owner === input.owner || byId.get(wire.targetId)?.owner === input.owner)
      && (!input.inactiveOnly || !wire.active))
    const page = CompactTable.page(matching, input.limit, input.cursor)
    const table = CompactTable.of(page.items, [
      ["label", wire => wire.label],
      ["source", wire => byId.get(wire.sourceId)?.topic ?? wire.sourceId],
      ["target", wire => byId.get(wire.targetId)?.topic ?? wire.targetId],
      ["transforms", wire => wire.transforms.map(step => step.op).join(" → ")],
      ["disabled", wire => !wire.enabled],
      ["inactive", wire => (wire.active || !wire.enabled ? undefined : wire.problem ?? "inactive")]
    ])
    return { ...table, total: page.total, ...(page.next ? { next: page.next } : {}) }
  }
}
