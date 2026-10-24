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
 * updated (new topic, type or direction) its wires are rebuilt, or removed if no longer valid;
 * a wire removed that way starts again once a later update makes it valid.
 */
export class WireEngine extends Disposable {
  private readonly wires = new Map<string, ActiveWire>()
  private readonly guard = new LoopGuard()
  /** wires a signal update made invalid, kept to start them again when an update fixes them */
  private readonly dropped = new Map<string, WireConfig>()

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
    const { from, to } = this.resolve(config)
    this.wires.set(config.id, new ActiveWire(config, from, to, this.bus, this.guard))
    this.dropped.delete(config.id)
    return config
  }

  /**
   * Why add() would refuse this wire right now, without starting it; undefined if it would start.
   * A running wire with the same id is ignored, so this also explains a stored wire that isn't running.
   */
  problem(input: WireInput): string | undefined {
    const parsed = WireSchema.safeParse(input)
    if (!parsed.success) return parsed.error.issues.map(issue => [issue.path.join("."), issue.message].filter(Boolean).join(": ")).join("; ")
    try {
      this.resolve(parsed.data)
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  /** also forgets a wire dropped by a signal update; @returns false if no wire with that id runs */
  remove(id: string) {
    this.dropped.delete(id)
    const wire = this.wires.get(id)
    if (!wire) return false
    this.wires.delete(id)
    wire.dispose().catch((error: unknown) => {
      const text = error instanceof Error ? error.message : String(error)
      this.bus.event(WIRE_ERROR_TOPIC, `wire "${WireEngine.nameOf(wire.config)}" failed to dispose: ${text}`, { source: { kind: "system", id: "wires" } })
    })
    return true
  }

  /** configs of the running wires, in creation order */
  list(): WireConfig[] {
    return [...this.wires.values()].map(wire => wire.config)
  }

  // a wire's own id is skipped when looking for another wire on the target, for problem()
  private resolve(config: WireConfig) {
    const from = this.signals.get(config.sourceId)
    const to = this.signals.get(config.targetId)
    if (!from) throw new Error(`source signal "${config.sourceId}" does not exist (any more)`)
    if (!to) throw new Error(`target signal "${config.targetId}" does not exist (any more)`)
    if (from.direction !== "source") throw new Error(`"${from.label || from.id}" is not a source`)
    if (to.direction !== "target") throw new Error(`"${to.label || to.id}" is not a target`)
    const feeding = [...this.wires.values()].find(wire => wire.config.targetId === to.id && wire.config.id !== config.id)
    if (feeding) throw new Error(`"${to.label || to.id}" is already fed by wire "${WireEngine.nameOf(feeding.config)}"`)
    return { from, to }
  }

  private removeWiresOf(signalId: string) {
    for (const wire of [...this.wires.values()]) {
      if (WireEngine.uses(wire.config, signalId)) this.remove(wire.config.id)
    }
    for (const config of [...this.dropped.values()]) if (WireEngine.uses(config, signalId)) this.dropped.delete(config.id)
  }

  // Rebuilt rather than patched, and failures are reported (not thrown) because this runs inside
  // the registry's emit and must not break the caller of update().
  // an ActiveWire holds the signals it was built with, so a changed signal needs a fresh one
  private rebuildWiresOf(signalId: string) {
    for (const wire of [...this.wires.values()]) {
      if (!WireEngine.uses(wire.config, signalId)) continue
      this.remove(wire.config.id)
      try {
        this.add(wire.config)
      } catch (error) {
        this.dropped.set(wire.config.id, wire.config)
        const text = error instanceof Error ? error.message : String(error)
        this.bus.event(WIRE_ERROR_TOPIC, `wire "${WireEngine.nameOf(wire.config)}" was removed: ${text}`, { source: { kind: "system", id: "wires" } })
      }
    }
    this.restartDropped(signalId)
  }

  // e.g. a Loxone signal turned into an input and back into an output; problem() first, so
  // nothing throws inside the registry's emit
  private restartDropped(signalId: string) {
    for (const config of [...this.dropped.values()]) {
      if (!WireEngine.uses(config, signalId) || this.problem(config) !== undefined) continue
      this.add(config)
    }
  }

  private static uses(config: WireConfig, signalId: string) {
    return config.sourceId === signalId || config.targetId === signalId
  }

  private static nameOf(config: WireConfig) {
    return config.label || config.id
  }

  private removeAll() {
    for (const id of [...this.wires.keys()]) this.remove(id)
  }
}
