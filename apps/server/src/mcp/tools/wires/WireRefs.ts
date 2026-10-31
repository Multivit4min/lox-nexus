import type { WireDto } from "@lox-nexus/api"
import { HttpError } from "../../../http/HttpError.ts"
import type { InventoryService, InventorySignal } from "../../../services/InventoryService.ts"

/** Finds the ends and wires an agent names: signals by topic or id, a wire by id or by its target. */
export class WireRefs {
  constructor(private readonly inventory: Pick<InventoryService, "signals" | "wires" | "find">) {}

  signals(): InventorySignal[] {
    return this.inventory.signals()
  }

  /** @throws HttpError 404 */
  signal(ref: string, signals = this.inventory.signals()): InventorySignal {
    const found = this.inventory.find(ref, signals)
    if (!found) throw HttpError.notFound(`signal "${ref}" (list_signals names them)`)
    return found
  }

  /**
   * A target has one wire at most, so its topic names the wire as well as the id does.
   * @throws HttpError 404
   */
  wire(ref: string): WireDto {
    const wires = this.inventory.wires()
    const byId = wires.find(wire => wire.id === ref)
    if (byId) return byId
    const target = this.inventory.find(ref)
    const byTarget = target && wires.find(wire => wire.targetId === target.id)
    if (!byTarget) throw HttpError.notFound(`wire "${ref}" (give its id or its target's topic; list_wires names them)`)
    return byTarget
  }

  /** "source → target" with topics, as the answers name a wire */
  describe(wire: Pick<WireDto, "sourceId" | "targetId">, signals = this.inventory.signals()) {
    const topic = (id: string) => signals.find(signal => signal.id === id)?.topic ?? id
    return `${topic(wire.sourceId)} → ${topic(wire.targetId)}`
  }
}
