import { EventEmitter } from "node:events"
import { Disposable, type Listenable } from "@lox-nexus/plugin-sdk"
import type { SolarApi } from "./SolarApi.ts"
import type { FroniusSnapshot } from "./SolarApiTypes.ts"

/** the endpoints a poll reads; only "powerflow" is required for a poll to count as successful */
export type PollPart = "powerflow" | "meter" | "storage"

/** called when a part starts failing (with the reason), changes its reason, or recovers (undefined) */
export type ProblemReport = (part: PollPart, problem: string | undefined) => void

/**
 * Polls the three realtime endpoints and keeps the latest snapshot. Emits "data" with the
 * snapshot after every successful poll. A poll requested while one is still running joins it
 * instead of starting a second one, so a slow inverter never gets a pile of parallel requests.
 */
export class Poller extends Disposable implements Listenable {
  /** the last successful poll's data; kept while the inverter is unreachable */
  latest: FroniusSnapshot | undefined
  /** time of the last successful poll, for the panel */
  lastSuccess: Date | undefined
  /** the last powerflow failure; kept after recovery. Optional endpoints' failures aren't recorded */
  lastError: { message: string; at: Date } | undefined
  private inFlight: Promise<void> | undefined
  private readonly problems = new Map<PollPart, string>()
  private readonly events = new EventEmitter()
  private readonly abort = new AbortController()

  constructor(private readonly api: SolarApi, private readonly report: ProblemReport, private readonly debug: (message: string, data?: unknown) => void = () => {}) {
    super()
    // waits for the running poll, so nothing of it is left once dispose() resolves
    this.onDispose(async () => {
      this.abort.abort()
      await this.inFlight
    })
  }

  /** the current reason the inverter can't be read, if any */
  get problem() {
    return this.problems.get("powerflow")
  }

  /** polls once, or joins the poll in flight; never rejects */
  poll(): Promise<void> {
    if (this.isDisposed) return Promise.resolve()
    this.inFlight ??= this.run().finally(() => (this.inFlight = undefined))
    return this.inFlight
  }

  /** resolves when no poll is running */
  async idle() {
    await this.inFlight
  }

  /** only "data" exists; this makes the poller usable with Disposable.listen() */
  on(event: "data", listener: (snapshot: FroniusSnapshot) => void) {
    this.events.on(event, listener)
    return this
  }

  off(event: "data", listener: (snapshot: FroniusSnapshot) => void) {
    this.events.off(event, listener)
    return this
  }

  private async run() {
    const signal = this.abort.signal
    const started = this.currentClock().now()
    const [powerflow, meter, storage] = await Promise.allSettled([
      this.api.powerFlow(signal), this.api.meters(signal), this.api.storages(signal)
    ])
    if (this.isDisposed) return
    const outcome = (result: PromiseSettledResult<unknown>) => (result.status === "fulfilled" ? "ok" : Poller.message(result.reason))
    const took = this.currentClock().now() - started
    this.debug(`polled in ${took} ms`, { powerflow: outcome(powerflow), meter: outcome(meter), storage: outcome(storage) })
    this.track("powerflow", powerflow)
    // with the inverter down, the optional endpoints fail too; that says nothing about the devices
    if (powerflow.status === "rejected") return
    this.track("meter", meter)
    this.track("storage", storage)
    this.latest = {
      powerflow: powerflow.value,
      ...(meter.status === "fulfilled" ? { meter: meter.value } : {}),
      ...(storage.status === "fulfilled" ? { storage: storage.value } : {})
    }
    this.lastSuccess = new Date()
    this.events.emit("data", this.latest)
  }

  // reports only changes, so a long outage is one status change and one log line, not one per poll
  private track(part: PollPart, result: PromiseSettledResult<unknown>) {
    const problem = result.status === "rejected" ? Poller.message(result.reason) : undefined
    if (problem && part === "powerflow") this.lastError = { message: problem, at: new Date() }
    if (problem === this.problems.get(part)) return
    if (problem === undefined) this.problems.delete(part)
    else this.problems.set(part, problem)
    this.report(part, problem)
  }

  private static message(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}
