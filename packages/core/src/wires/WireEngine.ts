import { Disposable } from "@lox-nexus/plugin-sdk"
import { ActiveWire, type WireBus } from "./ActiveWire.ts"
import { LoopGuard } from "./LoopGuard.ts"
import type { Signal } from "./Signal.ts"
import type { SignalRegistry } from "./SignalRegistry.ts"
import { WireSchema, type WireConfig, type WireInput } from "./WireSchema.ts"

/** Topic of events about wires that failed to dispose or were dropped because a signal changed. */
export const WIRE_ERROR_TOPIC = "system/wire/error"

/**
 * Owns all wires. A target can be fed by only one wire, so its value always has a single origin.
 * Wires whose source or target signal is unregistered are removed with it; when a signal is
 * updated (new topic, type or direction) its wires are rebuilt, or removed if no longer valid.
 */
export class WireEngine extends Disposable {
  private readonly wires = new Map<string, ActiveWire>()
  private readonly guard = new LoopGuard()

  /** Registers its own cleanup: disposing the engine removes all wires, and unregistering a signal removes its wires. */
  constructor(private readonly bus: WireBus, private readonly signals: SignalRegistry) {
    super()
    this.listen(signals, "unregistered", (signal: Signal) => this.removeWiresOf(signal.id))
    this.listen(signals, "updated", (signal: Signal) => this.rebuildWiresOf(signal.id))
    this.onDispose(() => this.removeAll())
  }

  /**
   * Validates and starts a wire.
   * @throws ZodError for an invalid config; Error for a duplicate id, an unknown signal, a source/target
   *   mix-up, or a target that already has a wire
   * @returns the parsed config with defaults applied
   */
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

  /** @returns false if the id is unknown */
  remove(id: string) {
    const wire = this.wires.get(id)
    if (!wire) return false
    this.wires.delete(id)
    wire.dispose().catch((error: unknown) => {
      const text = error instanceof Error ? error.message : String(error)
      this.bus.event(WIRE_ERROR_TOPIC, `wire "${wire.config.label}" failed to dispose: ${text}`, { source: { kind: "system", id: "wires" } })
    })
    return true
  }

  /** configs of the running wires, in creation order */
  list(): WireConfig[] {
    return [...this.wires.values()].map(wire => wire.config)
  }

  private removeWiresOf(signalId: string) {
    for (const wire of [...this.wires.values()]) {
      if (wire.config.sourceId === signalId || wire.config.targetId === signalId) this.remove(wire.config.id)
    }
  }

  // Rebuilt rather than patched, and failures are reported (not thrown) because this runs inside
  // the registry's emit and must not break the caller of update().
  // an ActiveWire holds the signals it was built with, so a changed signal needs a fresh one
  private rebuildWiresOf(signalId: string) {
    for (const wire of [...this.wires.values()]) {
      if (wire.config.sourceId !== signalId && wire.config.targetId !== signalId) continue
      this.remove(wire.config.id)
      try {
        this.add(wire.config)
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error)
        this.bus.event(WIRE_ERROR_TOPIC, `wire "${wire.config.label}" was removed: ${text}`, { source: { kind: "system", id: "wires" } })
      }
    }
  }

  private removeAll() {
    for (const id of [...this.wires.keys()]) this.remove(id)
  }
}
