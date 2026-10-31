import type { Recorder } from "@lox-nexus/core"
import { MessageFormatter } from "@lox-nexus/core"
import { z } from "zod"
import type { InventoryService } from "../../services/InventoryService.ts"
import type { McpTool } from "../McpTool.ts"
import { SignalTable } from "../SignalTable.ts"

const Input = z.object({ signal: z.string().min(1).max(300).describe("the signal's topic (or id)") })

/** One signal in full: its value, force, wires and why one carries nothing, and its last messages. */
export class GetSignalTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "get_signal"
  readonly title = "Show one signal"
  readonly description = "One signal by topic (or id): owner and Loxone or plugin details, the value and when it came, an active force, the wires to and from it with why an inactive one carries nothing, and its last 5 bus messages."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input
  private readonly messages = new MessageFormatter({ utc: true, topicWidth: 0 })

  constructor(private readonly inventory: Pick<InventoryService, "signals" | "require" | "wires" | "forces">, private readonly recorder: Pick<Recorder, "recent">) {}

  run(input: z.infer<typeof Input>) {
    const signals = this.inventory.signals()
    const signal = this.inventory.require(input.signal, signals)
    const topics = new Map(signals.map(entry => [entry.id, entry.topic]))
    const force = this.inventory.forces().find(entry => entry.topic === signal.topic)
    const wire = (other: string, wire: { label: string; active: boolean; problem?: string; transforms: unknown[] }) => ({
      other: topics.get(other) ?? other, label: wire.label, transforms: wire.transforms.length || undefined, ...(wire.active ? {} : { inactive: wire.problem ?? "inactive" })
    })
    const wires = this.inventory.wires()
    return {
      ...signal, value: SignalTable.value(signal), at: signal.at === undefined ? undefined : new Date(signal.at).toISOString(),
      ...(force ? { force: { by: force.by, ...(force.reason ? { reason: force.reason } : {}), ...(force.until ? { until: new Date(force.until).toISOString() } : {}) } } : {}),
      wiresFrom: wires.filter(entry => entry.targetId === signal.id).map(entry => wire(entry.sourceId, entry)),
      wiresTo: wires.filter(entry => entry.sourceId === signal.id).map(entry => wire(entry.targetId, entry)),
      recent: this.recorder.recent(5, signal.topic).map(message => this.messages.format(message))
    }
  }
}
