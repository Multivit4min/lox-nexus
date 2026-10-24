import type { Actuator, ActuatorConcurrency } from "../plugin/Actuator.ts"
import type { Plugin } from "../plugin/Plugin.ts"
import type { Value } from "../values/Value.ts"
import { CauseScope } from "./CauseScope.ts"

/** Thrown for a "latest" command that never ran because a newer one arrived. */
export class SupersededError extends Error {
  constructor() {
    super("skipped: a newer value arrived before this one ran")
  }
}

interface Waiting {
  value: Value
  causeId: string | undefined
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

  constructor(private readonly actuator: Actuator<Plugin, unknown, Value>, private readonly concurrency: ActuatorConcurrency) {}

  /** resolves when run() finished for this value; rejects with its error or SupersededError */
  submit(value: Value, causeId: string | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.concurrency === "latest") this.waiting.splice(0).forEach(entry => entry.reject(new SupersededError()))
      this.waiting.push({ value, causeId, resolve, reject })
      void this.drain()
    })
  }

  private async drain() {
    if (this.busy) return
    this.busy = true
    for (let next = this.waiting.shift(); next; next = this.waiting.shift()) {
      const { value, causeId, resolve, reject } = next
      try {
        await CauseScope.run(causeId, () => this.actuator.run(value))
        resolve()
      } catch (error) {
        reject(error)
      }
    }
    this.busy = false
  }
}
