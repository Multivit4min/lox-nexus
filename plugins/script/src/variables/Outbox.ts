import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import { Throttle } from "./Throttle.ts"
import type { VariableTable } from "./VariableTable.ts"

/** A sensor as the outbox sees it. */
export interface OutputSink {
  readonly name: string
  push(value: Value): void
}

/**
 * Values the script sends with `nexus.set`, on their way to the sensors with that name. Sends
 * are throttled per name (latest wins), and the latest value of a name is kept, so a sensor added
 * later starts with it.
 */
export class Outbox extends Disposable {
  static readonly THROTTLE_MS = 100
  private readonly sinks = new Map<string, Set<OutputSink>>()
  private readonly throttle = this.own(new Throttle(Outbox.THROTTLE_MS))

  constructor(private readonly table: VariableTable, private readonly now: () => number = Date.now) {
    super()
  }

  set(name: string, value: Value) {
    // past the name cap: a name without a record has no sensor either, so nothing would receive it
    const record = this.table.use(name, "set")
    if (!record) return
    record.calls++
    record.lastAt = this.now()
    record.value = value
    this.throttle.run(name, () => this.deliver(name, value))
  }

  /** connects a sensor and hands it the latest value; returns the function that disconnects it */
  attach(sink: OutputSink): () => void {
    const record = this.table.signal(sink.name, "set")
    const sinks = this.sinks.get(sink.name) ?? new Set()
    sinks.add(sink)
    this.sinks.set(sink.name, sinks)
    record.signals++
    if (record.value) sink.push(record.value)
    return () => {
      sinks.delete(sink)
      record.signals--
      if (sinks.size === 0 && this.sinks.get(sink.name) === sinks) this.sinks.delete(sink.name)
    }
  }

  private deliver(name: string, value: Value) {
    for (const sink of this.sinks.get(name) ?? []) sink.push(value)
  }
}
