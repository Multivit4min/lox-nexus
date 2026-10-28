import { Disposable } from "@lox-nexus/plugin-sdk"
import { Converter, type Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage, Cause, MessageSource } from "../bus/BusMessage.ts"
import type { EventBus } from "../bus/EventBus.ts"
import type { LoopGuard } from "./LoopGuard.ts"
import type { Signal } from "./Signal.ts"
import { TransformFactory } from "./transforms/TransformFactory.ts"
import { TransformPipeline } from "./transforms/TransformPipeline.ts"
import type { WireConfig } from "./WireSchema.ts"

/** Topic of the events that report a value dropped by the LoopGuard. */
export const WIRE_LOOP_TOPIC = "system/wire/loop"

/** The slice of EventBus a wire needs, so wires can be tested with a fake. */
export type WireBus = Pick<EventBus, "subscribe" | "publish" | "command" | "event" | "current">

/**
 * A running wire: listens to its source topic and delivers transformed values to its target.
 * Messages it publishes carry the wire as source and continue the trace of the message that
 * triggered them, which is what lets the LoopGuard and the inspector follow a value across wires.
 * Disposing it unsubscribes and cancels pending debounce/throttle timers.
 */
export class ActiveWire extends Disposable {
  private readonly pipeline: TransformPipeline
  private readonly source: MessageSource

  /** Subscribes to `from.topic` immediately. Signals are passed in (resolved by WireEngine) so the wire never looks them up. */
  constructor(
    readonly config: WireConfig,
    private readonly from: Signal,
    private readonly target: Signal,
    private readonly bus: WireBus,
    private readonly guard: LoopGuard
  ) {
    super()
    this.source = { kind: "wire", id: config.id, label: config.label }
    const factory = new TransformFactory()
    this.pipeline = this.own(new TransformPipeline(config.transforms.map(t => factory.create(t)), (value, cause) => this.deliver(value, cause)))
    this.own(bus.subscribe(from.topic, message => this.handle(message)))
  }

  /**
   * Delivers the value the source shows right now, as if it had just been published. The same
   * rules apply: nothing while disabled, and a restored value only with syncOnStart or `restored`.
   */
  sync({ restored = false } = {}) {
    const current = this.bus.current(this.from.topic)
    if (current) this.handle(current, restored)
  }

  // Only state and command carry a value to forward. Shadowed publishes never reach subscribers,
  // so a forced source does not leak its real value through the wire. Restored (snapshot) values
  // are skipped unless syncOnStart, so a restart doesn't re-trigger actuators with stale data.
  private handle(message: BusMessage, restored = false) {
    if (!this.config.enabled || !message.value) return
    if (message.kind !== "state" && message.kind !== "command") return
    if (message.flags?.restored && !this.config.syncOnStart && !restored) return
    if (!this.guard.allow(this.config.id, message)) {
      return this.bus.event(WIRE_LOOP_TOPIC, `wire "${this.config.label}" dropped a value: loop detected`, { source: this.source, cause: message })
    }
    this.pipeline.push(message.value, message)
  }

  // Conversion happens here, after the transforms, so a map/scale sees the source's own type.
  private deliver(value: Value, cause: Cause) {
    const converted = this.target.valueType === "any" ? value : Converter.convert(value, this.target.valueType)
    const options = { source: this.source, cause }
    if (this.target.delivery === "command") this.bus.command(this.target.topic, converted, options)
    else this.bus.publish(this.target.topic, converted, options)
  }
}
