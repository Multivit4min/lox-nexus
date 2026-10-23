import { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "./BusMessage.ts"
import type { CausalChain } from "./CausalChain.ts"
import type { Clock } from "./Clock.ts"
import type { ForceRegistry } from "./ForceRegistry.ts"
import type { Pending } from "./Pending.ts"
import type { RetainedState } from "./RetainedState.ts"
import type { Subscribers } from "./Subscribers.ts"
import type { TopicKinds } from "./TopicKinds.ts"

/** The semantics of each message kind: dedup, shadowing while forced, force and release. */
export class BusProcessor {
  constructor(
    private readonly chain: CausalChain,
    private readonly clock: Clock,
    private readonly retained: RetainedState,
    private readonly forces: ForceRegistry,
    private readonly subscribers: Subscribers,
    private readonly topicKinds?: TopicKinds
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
    const forced = this.forces.get(pending.topic) !== undefined
    const previous = forced ? this.retained.real(pending.topic) : this.retained.effective(pending.topic)
    if (!pending.options.force && previous && Value.equals(previous.value, pending.value)) return
    const message = this.accept(pending, forced ? { shadowed: true } : undefined)
    this.retained.setReal(message)
    if (forced) return this.subscribers.dispatch(message, true)
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
    const kind = info.kind ?? this.topicKinds?.kindOf(pending.topic) ?? this.retained.kindOf(pending.topic)
    const { by, reason, until } = info
    this.forces.set({ topic: pending.topic, value: pending.value, by, reason, until, at: info.at ?? this.clock.now(), kind })
    const forceMessage = this.accept({ ...pending, extra: { force: { ...info, kind } } })
    this.subscribers.dispatch(forceMessage, true)
    const effective = this.accept({
      kind,
      topic: pending.topic,
      value: pending.value,
      options: { source: pending.options.source, cause: forceMessage, flags: { ...pending.options.flags, forced: true } }
    })
    this.retained.setEffective(effective)
    this.subscribers.dispatch(effective)
  }

  private release(pending: Pending) {
    const record = this.forces.get(pending.topic)
    if (!record || !this.forces.delete(pending.topic)) return
    const releaseMessage = this.accept(pending)
    this.subscribers.dispatch(releaseMessage, true)
    const real = this.retained.real(pending.topic)
    if (record.kind !== "state" || !real?.value) return this.retained.clearEffective(pending.topic)
    // a value replayed from the snapshot stays flagged, so wires don't treat it as live
    const flags = real.flags?.restored ? { restored: true as const } : undefined
    const restored = this.accept({ kind: "state", topic: pending.topic, value: real.value, options: { source: real.source, cause: releaseMessage, flags } })
    this.retained.setEffective(restored)
    this.subscribers.dispatch(restored)
  }

  private accept(pending: Pending, extraFlags?: BusMessage["flags"]): BusMessage {
    const { source, cause } = pending.options
    const identity = this.chain.mint(cause, source.kind === "wire" ? source.id : undefined)
    const flags = extraFlags || pending.options.flags ? { ...pending.options.flags, ...extraFlags } : undefined
    return {
      ...identity,
      ts: this.clock.now(),
      topic: pending.topic,
      kind: pending.kind,
      source,
      ...(pending.value ? { value: pending.value } : {}),
      ...(flags ? { flags } : {}),
      ...pending.extra
    }
  }
}
