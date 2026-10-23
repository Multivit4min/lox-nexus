import type { DisposableLike } from "@lox-nexus/plugin-sdk"
import { Converter, type Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage, Cause, MessageSource } from "../bus/BusMessage.ts"
import type { EventBus } from "../bus/EventBus.ts"
import type { LoopGuard } from "./LoopGuard.ts"
import type { Signal } from "./Signal.ts"
import { TransformFactory } from "./transforms/TransformFactory.ts"
import { TransformPipeline } from "./transforms/TransformPipeline.ts"
import type { WireConfig } from "./WireSchema.ts"

export const WIRE_LOOP_TOPIC = "system/wire/loop"

/** A running wire: listens to its source topic and delivers transformed values to its target. */
export class ActiveWire implements DisposableLike {
  private readonly pipeline: TransformPipeline
  private readonly subscription: DisposableLike
  private readonly source: MessageSource

  constructor(
    readonly config: WireConfig,
    from: Signal,
    private readonly target: Signal,
    private readonly bus: EventBus,
    private readonly guard: LoopGuard
  ) {
    this.source = { kind: "wire", id: config.id, label: config.label }
    const factory = new TransformFactory()
    this.pipeline = new TransformPipeline(config.transforms.map(t => factory.create(t)), (value, cause) => this.deliver(value, cause))
    this.subscription = bus.subscribe(from.topic, message => this.handle(message))
  }

  dispose() {
    this.subscription.dispose()
    this.pipeline.dispose()
  }

  private handle(message: BusMessage) {
    if (!this.config.enabled || !message.value) return
    if (message.kind !== "state" && message.kind !== "command") return
    if (message.flags?.restored && !this.config.syncOnStart) return
    if (!this.guard.allow(this.config.id, message)) {
      return this.bus.event(WIRE_LOOP_TOPIC, `wire "${this.config.label}" dropped a value: loop detected`, { source: this.source, cause: message })
    }
    this.pipeline.push(message.value, message)
  }

  private deliver(value: Value, cause: Cause) {
    const converted = this.target.valueType === "any" ? value : Converter.convert(value, this.target.valueType)
    const options = { source: this.source, cause }
    if (this.target.delivery === "command") this.bus.command(this.target.topic, converted, options)
    else this.bus.publish(this.target.topic, converted, options)
  }
}
