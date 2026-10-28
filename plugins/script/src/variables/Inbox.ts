import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import { JsValues } from "../nexus/JsValues.ts"
import type { ScriptCallback } from "../run/ScriptGuard.ts"
import type { VariableTable } from "./VariableTable.ts"

/**
 * Values actuators receive, on their way into the script: kept for `nexus.get` and passed to the
 * `nexus.on` handlers of that name.
 */
export class Inbox extends Disposable {
  /** how long a command waits for its handlers; the queue of its actuator moves on after that */
  static readonly HANDLER_LIMIT_MS = 30_000
  private readonly handlers = new Map<string, Set<ScriptCallback>>()

  /**
   * @param report logs a handler's error and returns its description with the script line
   * @param adopt turns a value into one of the script's realm
   */
  constructor(
    private readonly table: VariableTable,
    private readonly report: (origin: string, error: unknown) => string,
    private readonly adopt: (value: unknown) => unknown,
    private readonly now: () => number = Date.now
  ) {
    super()
  }

  /** adds a handler; returns the function that removes it again, or undefined past the name cap */
  on(name: string, handler: ScriptCallback): (() => void) | undefined {
    if (!this.table.use(name, "receive")) return undefined
    const handlers = this.handlers.get(name) ?? new Set()
    handlers.add(handler)
    this.handlers.set(name, handlers)
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0 && this.handlers.get(name) === handlers) this.handlers.delete(name)
    }
  }

  /** the latest value an actuator with this name received, undefined before the first */
  get(name: string): unknown {
    const value = this.table.use(name, "receive")?.value
    return value === undefined ? undefined : this.adopt(JsValues.toPlain(value))
  }

  /** connects an actuator; returns the function that disconnects it */
  attach(name: string): () => void {
    const record = this.table.signal(name, "receive")
    record.signals++
    return () => void record.signals--
  }

  /**
   * Stores the value and runs every handler of the name, waiting for all of them, at most
   * HANDLER_LIMIT_MS. A handler still busy then keeps running; only the command gives up.
   * @throws Error with the scripts' messages when a handler threw or rejected, or didn't settle
   */
  async receive(name: string, value: Value): Promise<void> {
    const record = this.table.signal(name, "receive")
    record.calls++
    record.lastAt = this.now()
    record.value = value
    const handlers = [...this.handlers.get(name) ?? []]
    const results = await this.withinLimit(Promise.allSettled(handlers.map(handler => this.invoke(handler, value))))
    const failures = results.flatMap(result => (result.status === "rejected" ? [this.report(`nexus.on("${name}")`, result.reason)] : []))
    if (failures.length > 0) throw new Error(failures.join("; "))
  }

  private async withinLimit<T>(work: Promise<T>): Promise<T> {
    let cancel = () => {}
    const limit = new Promise<never>((_, reject) => {
      cancel = this.after(Inbox.HANDLER_LIMIT_MS, () => reject(new Error(`a nexus.on handler did not settle within ${Inbox.HANDLER_LIMIT_MS / 1000} s`)))
    })
    try {
      return await Promise.race([work, limit])
    } finally {
      cancel()
    }
  }

  private async invoke(handler: ScriptCallback, value: Value) {
    await handler(this.adopt(JsValues.toPlain(value)))
  }
}
