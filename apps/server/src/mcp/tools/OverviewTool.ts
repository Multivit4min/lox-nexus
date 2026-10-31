import { z } from "zod"
import type { ChangeLock } from "../../http/ChangeLock.ts"
import type { InventoryService, InventorySignal } from "../../services/InventoryService.ts"
import { CompactTable } from "../CompactTable.ts"
import type { McpTool } from "../McpTool.ts"
import { SignalTable } from "../SignalTable.ts"

const Input = z.object({
  signals: z.boolean().optional().describe("also the table of every signal (topic, owner, direction, type, packet id or capability, value, wires, flags), as long as it fits in one answer")
})

/**
 * The whole installation in one answer: Miniservers, plugins and instances, wires, forces, stale
 * signals and the problems worth a look; optionally every signal. Agents start here, so they
 * don't search piece by piece.
 */
export class OverviewTool implements McpTool<z.infer<typeof Input>> {
  /** the signal table's limit in characters, so the whole answer stays under ToolCall's 64 KB as valid JSON */
  static readonly MAX_TABLE = 48 * 1024
  readonly name = "overview"
  readonly title = "Overview of the installation"
  readonly description = "Start here. Miniservers (health, load, signal counts), installed plugins (describe_plugin has their capabilities), plugin instances (state, problems), wire counts, forces, stale signals and a list of problems. With signals: true also every signal as a table. Name signals by topic afterwards."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input

  constructor(private readonly inventory: InventoryService, private readonly nexus: { version: string; lock?: Pick<ChangeLock, "heldBy">; now: () => number }) {}

  run(input: z.infer<typeof Input>) {
    const signals = this.inventory.signals()
    const wires = this.inventory.wires()
    const heldBy = this.nexus.lock?.heldBy
    return {
      nexus: { version: this.nexus.version, time: new Date(this.nexus.now()).toISOString(), ...(heldBy ? { busy: `${heldBy} is running; changes wait` } : {}) },
      miniservers: this.miniservers(signals),
      plugins: this.plugins(),
      instances: this.instances(signals),
      wires: { total: wires.length, inactive: wires.filter(wire => !wire.active).length },
      forces: signals.filter(signal => signal.forced).length,
      stale: signals.filter(signal => signal.stale).length,
      problems: this.problems(signals),
      ...(input.signals ? { signals: OverviewTool.signalTable(signals) } : {})
    }
  }

  // measured, not counted: a row is 100 to 300 characters, depending on labels and params
  private static signalTable(signals: InventorySignal[]) {
    const table = SignalTable.of(signals)
    if (JSON.stringify(table).length <= OverviewTool.MAX_TABLE) return table
    return `${signals.length} signals: too many for one answer; use list_signals per owner (see the miniservers and instances tables)`
  }

  private miniservers(signals: InventorySignal[]) {
    return CompactTable.of(this.inventory.miniservers(), [
      ["slug", server => server.slug], ["label", server => server.label], ["host", server => `${server.host}:${server.port}`],
      ["health", server => (server.enabled ? server.health : "disabled")], ["load%", server => Math.round(server.load)],
      ["signalsIn", server => signals.filter(signal => signal.owner === `miniserver:${server.slug}` && signal.dir === "in").length],
      ["signalsOut", server => signals.filter(signal => signal.owner === `miniserver:${server.slug}` && signal.dir === "out").length]
    ])
  }

  // counts only: the capabilities of a dozen plugins would crowd the answer; describe_plugin has them
  private plugins() {
    return CompactTable.of(this.inventory.packages(), [
      ["id", pkg => pkg.id], ["name", pkg => pkg.name], ["version", pkg => pkg.version],
      ["sensors", pkg => pkg.description.sensors.length], ["actuators", pkg => pkg.description.actuators.length],
      ["actions", pkg => pkg.description.actions?.length ?? 0], ["watches", pkg => pkg.description.watches !== undefined]
    ])
  }

  private instances(signals: InventorySignal[]) {
    return CompactTable.of(this.inventory.instances(), [
      ["slug", instance => instance.slug], ["plugin", instance => instance.plugin], ["label", instance => instance.label],
      ["state", instance => instance.state], ["problem", instance => instance.statusMessage ?? instance.lastError],
      ["signals", instance => signals.filter(signal => signal.owner === `plugin:${instance.slug}`).length]
    ])
  }

  // what an agent should look at first, each in one line; at most 20
  private problems(signals: InventorySignal[]) {
    const topics = new Map(signals.map(signal => [signal.id, signal.topic]))
    return [
      ...this.inventory.miniservers().filter(server => server.enabled && (server.health === "stale" || server.load > 70))
        .map(server => `Miniserver ${server.slug}: ${server.health === "stale" ? "no answer from the Miniserver" : `load ${Math.round(server.load)} %`}`),
      ...this.inventory.instances().filter(instance => ["degraded", "error", "crashed"].includes(instance.state))
        .map(instance => `plugin ${instance.slug}: ${instance.state}${instance.statusMessage || instance.lastError ? `: ${instance.statusMessage ?? instance.lastError}` : ""}`),
      ...this.inventory.wires().filter(wire => !wire.active && wire.enabled)
        .map(wire => `wire ${topics.get(wire.sourceId) ?? wire.sourceId} → ${topics.get(wire.targetId) ?? wire.targetId}: ${wire.problem ?? "inactive"}`),
      ...signals.filter(signal => signal.error).map(signal => `signal ${signal.topic}: ${signal.error}`)
    ].slice(0, 20)
  }
}
