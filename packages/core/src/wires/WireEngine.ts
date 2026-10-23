import { Disposable } from "@lox-nexus/plugin-sdk"
import type { EventBus } from "../bus/EventBus.ts"
import { ActiveWire } from "./ActiveWire.ts"
import { LoopGuard } from "./LoopGuard.ts"
import type { SignalRegistry } from "./SignalRegistry.ts"
import { WireSchema, type WireConfig, type WireInput } from "./WireSchema.ts"

/** Owns all wires. A target can be fed by only one wire, so its value always has a single origin. */
export class WireEngine extends Disposable {
  private readonly wires = new Map<string, ActiveWire>()
  private readonly guard = new LoopGuard()

  constructor(private readonly bus: EventBus, private readonly signals: SignalRegistry) {
    super()
    this.onDispose(() => this.removeAll())
  }

  add(input: WireInput): WireConfig {
    const config = WireSchema.parse(input)
    if (this.wires.has(config.id)) throw new Error(`wire "${config.id}" already exists`)
    const from = this.signals.require(config.sourceId)
    const to = this.signals.require(config.targetId)
    if (from.direction !== "source") throw new Error(`signal "${from.id}" is not a source`)
    if (to.direction !== "target") throw new Error(`signal "${to.id}" is not a target`)
    const feeding = [...this.wires.values()].find(wire => wire.config.targetId === to.id)
    if (feeding) throw new Error(`target "${to.id}" is already fed by wire "${feeding.config.id}"`)
    this.wires.set(config.id, new ActiveWire(config, from, to, this.bus, this.guard))
    return config
  }

  remove(id: string) {
    const wire = this.wires.get(id)
    if (!wire) return false
    wire.dispose()
    return this.wires.delete(id)
  }

  list(): WireConfig[] {
    return [...this.wires.values()].map(wire => wire.config)
  }

  private removeAll() {
    for (const id of [...this.wires.keys()]) this.remove(id)
  }
}
