import { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "./BusMessage.ts"
import type { CausalChain } from "./CausalChain.ts"
import type { Clock } from "./Clock.ts"
import type { ForceRegistry } from "./ForceRegistry.ts"
import type { Pending } from "./Pending.ts"
import type { RetainedState } from "./RetainedState.ts"
import type { Subscribers } from "./Subscribers.ts"

/** The semantics of each message kind: dedup, shadowing while forced, force and release. */
export class BusProcessor {
  constructor(
    private readonly chain: CausalChain,
    private readonly clock: Clock,
    private readonly retained: RetainedState,
    private readonly forces: ForceRegistry,
    private readonly subscribers: Subscribers
  ) {}

  process(pending: Pending) {
    switch (pending.kind) {
      case "state": return this.state(pending)
      case "command": return this.command(pending)
      case "force": return this.force(pending)
      case "release": return this.release(pending)
      default: return this.subscribers.dispatch(this.accept(pending))
    }
  }

  private state(pending: Pending) {
    if (this.forces.get(pending.topic)) {
      const shadowed = this.accept(pending, { shadowed: true })
      this.retained.setReal(shadowed)
      return this.subscribers.dispatch(shadowed, true)
    }
    const current = this.retained.effective(pending.topic)
    if (!pending.options.force && current && Value.equals(current.value, pending.value)) return
    const message = this.accept(pending)
    this.retained.setReal(message)
    this.retained.setEffective(message)
    this.subscribers.dispatch(message)
  }

  private command(pending: Pending) {
    this.retained.noteCommand(pending.topic)
    if (this.forces.get(pending.topic)) return this.subscribers.dispatch(this.accept(pending, { shadowed: true }), true)
    this.subscribers.dispatch(this.accept(pending))
  }

  private force(pending: Pending) {
    const info = pending.extra?.force
    if (!pending.value || !info) return
    const forceMessage = this.accept(pending)
    this.forces.set({ topic: pending.topic, value: pending.value, ...info, at: forceMessage.ts })
    this.subscribers.dispatch(forceMessage, true)
    const effective = this.accept({
      kind: this.retained.kindOf(pending.topic),
      topic: pending.topic,
      value: pending.value,
      options: { source: pending.options.source, cause: forceMessage, flags: { ...pending.options.flags, forced: true } }
    })
    this.retained.setEffective(effective)
    this.subscribers.dispatch(effective)
  }

  private release(pending: Pending) {
    if (!this.forces.delete(pending.topic)) return
    const releaseMessage = this.accept(pending)
    this.subscribers.dispatch(releaseMessage, true)
    const real = this.retained.real(pending.topic)
    if (this.retained.kindOf(pending.topic) !== "state" || !real?.value) return
    const restored = this.accept({ kind: "state", topic: pending.topic, value: real.value, options: { source: real.source, cause: releaseMessage } })
    this.retained.setEffective(restored)
    this.subscribers.dispatch(restored)
  }

  private accept(pending: Pending, extraFlags?: BusMessage["flags"]): BusMessage {
    const identity = this.chain.mint(pending.options.cause)
    const flags = extraFlags || pending.options.flags ? { ...pending.options.flags, ...extraFlags } : undefined
    return {
      ...identity,
      ts: this.clock.now(),
      topic: pending.topic,
      kind: pending.kind,
      source: pending.options.source,
      ...(pending.value ? { value: pending.value } : {}),
      ...(flags ? { flags } : {}),
      ...pending.extra
    }
  }
}
