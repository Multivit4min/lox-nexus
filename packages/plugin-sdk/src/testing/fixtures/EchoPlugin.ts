import { EventEmitter } from "node:events"
import { z } from "zod"
import { Actuator } from "../../plugin/Actuator.ts"
import { Plugin } from "../../plugin/Plugin.ts"
import { Sensor } from "../../plugin/Sensor.ts"
import { Value } from "../../values/Value.ts"

const config = z.object({ greeting: z.string().default("hi"), failStart: z.boolean().default(false) })

/** emits its start value, then every number the plugin's "tick" event carries */
class CounterSensor extends Sensor<EchoPlugin, { start: number }> {
  static readonly id = "counter"
  static readonly params = z.object({ start: z.number() })
  static readonly valueType = "number"

  override start() {
    this.emit(Value.number(this.params.start))
    this.listen(this.plugin.ticks, "tick", (n: number) => this.emit(Value.number(n)))
  }
}

/** remembers what it ran and forwards it as a tick, so causes can be followed */
class SetActuator extends Actuator<EchoPlugin, object, Extract<Value, { type: "number" }>> {
  static readonly id = "set"
  static readonly accepts = "number"

  run(value: Extract<Value, { type: "number" }>) {
    if (value.value < 0) throw new Error("negative values are refused")
    this.plugin.received.push(value.value)
    this.plugin.log.info("set", { value: value.value })
    this.plugin.ticks.emit("tick", value.value)
  }
}

/** waits for the plugin's gate before finishing, so tests can pile up commands */
class SlowActuator extends Actuator<EchoPlugin, object, Value> {
  static readonly id = "slow"
  static readonly concurrency = "latest"

  async run(value: Value) {
    await this.plugin.gate
    this.plugin.received.push(value.type === "number" ? value.value : -1)
  }
}

/** A plugin that exercises every part of the runtime. */
export class EchoPlugin extends Plugin<z.infer<typeof config>> {
  static readonly config = config
  static readonly sensors = [CounterSensor]
  static readonly actuators = [SetActuator, SlowActuator]
  readonly ticks = new EventEmitter()
  readonly received: number[] = []
  gate: Promise<void> = Promise.resolve()

  override start() {
    if (this.config.failStart) throw new Error("start failed on purpose")
    this.store.set("starts", (this.store.get<number>("starts") ?? 0) + 1)
    this.http.route("POST", "/echo", request => ({ status: 200, body: `${this.config.greeting} ${request.body}` }))
  }

  override catalog() {
    return [{ label: "Counters", entries: [{ kind: "sensor" as const, capability: "counter", params: { start: 1 }, label: "Counter from 1" }] }]
  }

  override panel() {
    return { type: "keyValue" as const, items: [{ label: "received", value: String(this.received.length) }] }
  }
}
