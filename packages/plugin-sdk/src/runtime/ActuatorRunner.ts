import type { Actuator, ActuatorConcurrency } from "../plugin/Actuator.ts"
import type { Plugin } from "../plugin/Plugin.ts"
import type { Value } from "../values/Value.ts"
import { CauseScope } from "./CauseScope.ts"

/**
 * The failure reported for a "latest" command that never ran because a newer one arrived. The
 * runtime creates it; plugins never throw it, but may see it in tests as the outcome of a command.
 */
export class SupersededError extends Error {
  constructor() {
    super("skipped: a newer value arrived before this one ran")
  }
}

interface Waiting {
  value: Value
  causeId: string | undefined
  replayed: boolean
  resolve: () => void
  reject: (error: unknown) => void
}

/**
 * Runs one actuator's commands one at a time. "queue" runs every command in order; "latest"
 * keeps only the newest waiting one and rejects the ones it replaces with SupersededError.
 */
export class ActuatorRunner {
  private readonly waiting: Waiting[] = []
  private busy = false
  private closed = false

  constructor(private readonly actuator: Actuator<Plugin, unknown, Value>, private readonly concurrency: ActuatorConcurrency) {}

  /** resolves when run() finished for this value; rejects with its error, SupersededError, or after close() */
  submit(value: Value, causeId: string | undefined, replayed = false): Promise<void> {
    if (this.closed) return Promise.reject(new Error("the actuator was removed"))
    return new Promise((resolve, reject) => {
      if (this.concurrency === "latest") this.waiting.splice(0).forEach(entry => entry.reject(new SupersededError()))
      this.waiting.push({ value, causeId, replayed, resolve, reject })
      void this.drain()
    })
  }

  /** rejects every waiting command; the one running finishes. Call before disposing the actuator. */
  close() {
    this.closed = true
    this.waiting.splice(0).forEach(entry => entry.reject(new Error("the actuator was removed")))
  }

  private async drain() {
    if (this.busy) return
    this.busy = true
    for (let next = this.waiting.shift(); next; next = this.waiting.shift()) {
      const { value, causeId, replayed, resolve, reject } = next
      try {
        await CauseScope.run(causeId, () => this.actuator.run(value, { replayed }))
        resolve()
      } catch (error) {
        reject(error)
      }
    }
    this.busy = false
  }
}
