import { EventEmitter } from "node:events"
import { Disposable, type Listenable, type Listener } from "@lox-nexus/plugin-sdk"
import { ApiError } from "../api/ApiError.ts"
import type { NetworkApi } from "../api/NetworkApi.ts"
import { Backoff } from "./Backoff.ts"
import { DeviceExtras } from "./DeviceExtras.ts"
import { NetworkSnapshot } from "./NetworkSnapshot.ts"
import type { PollDemand } from "./PollDemand.ts"
import type { SiteResolver } from "./SiteResolver.ts"

/** called when polling starts failing (with the reason), changes its reason, or works again (undefined) */
export type PollReport = (problem: string | undefined) => void

/**
 * The one poll loop: clients, devices and Wi-Fi networks on every tick; port details of switches
 * and statistics as DeviceExtras decides. Emits "data" with each new snapshot and "failed" when
 * polling starts failing or its reason changes. After a failure it waits longer each time
 * (doubling up to 5 minutes) before the next attempt, so a console that is down isn't hammered.
 * A poll asked for while one runs joins it.
 */
export class NetworkPoller extends Disposable implements Listenable {
  static readonly MAX_BACKOFF_MS = 5 * 60_000
  latest: NetworkSnapshot | undefined
  /** the Network application's version, read once per run */
  version: string | undefined
  lastError: { message: string; at: number } | undefined
  problem: string | undefined
  private inFlight: Promise<void> | undefined
  private retryAt = 0
  private readonly backoff: Backoff
  private readonly events = new EventEmitter()
  private readonly extras: DeviceExtras

  constructor(
    private readonly api: Pick<NetworkApi, "info" | "clients" | "devices" | "device" | "statistics" | "wifiBroadcasts">,
    private readonly site: SiteResolver,
    private readonly demand: PollDemand,
    private readonly intervalMs: number,
    private readonly report: PollReport,
    private readonly debug: (message: string, data?: unknown) => void = () => {}
  ) {
    super()
    // every poll-fed signal listens; a busy instance has far more than Node's default of 10
    this.events.setMaxListeners(0)
    this.backoff = new Backoff(intervalMs, NetworkPoller.MAX_BACKOFF_MS)
    this.extras = new DeviceExtras(api, demand)
    // waits for the running poll, so nothing of it is left once dispose() resolves
    this.onDispose(() => this.inFlight)
  }

  /** polls now and then every interval; call once the poller is owned (its timers run on the owner's clock) */
  start() {
    this.every(this.intervalMs, () => void this.tick())
    void this.poll()
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

  /** "data" (NetworkSnapshot) or "failed" (message); this makes the poller usable with Disposable.listen() */
  on(event: "data" | "failed", listener: Listener) {
    this.events.on(event, listener)
    return this
  }

  off(event: "data" | "failed", listener: Listener) {
    this.events.off(event, listener)
    return this
  }

  // a tick during the backoff wait does nothing
  private tick() {
    if (this.currentClock().now() < this.retryAt) return Promise.resolve()
    return this.poll()
  }

  private async run() {
    const started = this.currentClock().now()
    try {
      const snapshot = await this.read()
      if (this.isDisposed) return
      this.succeeded(snapshot, started)
    } catch (error) {
      if (this.isDisposed) return
      // a site that was renamed or removed answers 404: look it up again next time
      if (error instanceof ApiError && error.status === 404) this.site.forget()
      this.failed(error instanceof Error ? error.message : String(error), started)
    }
  }

  private async read() {
    this.version ??= (await this.api.info()).applicationVersion
    const site = await this.site.id()
    const [clients, devices] = await Promise.all([this.api.clients(site), this.api.devices(site)])
    const [extras, wifi] = await Promise.all([this.extras.read(site, devices), this.wifi(site)])
    return new NetworkSnapshot({ at: this.currentClock().now(), clients, devices, extras, ...wifi })
  }

  // older Network versions may lack the Wi-Fi endpoints; that mustn't stop presence and devices
  private async wifi(site: string) {
    try {
      return { wifi: await this.api.wifiBroadcasts(site) }
    } catch (error) {
      return { wifi: undefined, wifiProblem: error instanceof Error ? error.message : String(error) }
    }
  }

  private succeeded(snapshot: NetworkSnapshot, started: number) {
    this.debug(`polled in ${snapshot.at - started} ms`, { clients: snapshot.clients.length, devices: snapshot.devices.length, problems: [...snapshot.extras.portProblems.values(), ...snapshot.extras.statisticsProblems.values()] })
    this.latest = snapshot
    this.backoff.reset()
    this.retryAt = 0
    if (this.problem !== undefined) {
      this.problem = undefined
      this.report(undefined)
    }
    this.events.emit("data", snapshot)
  }

  // reports only changes, so a long outage is one status change and one log line, not one per poll
  // the wait counts from the poll's start, so the first retry is the next regular tick
  private failed(message: string, started: number) {
    this.lastError = { message, at: this.currentClock().now() }
    this.retryAt = started + this.backoff.next()
    if (message === this.problem) return
    this.problem = message
    this.report(message)
    this.events.emit("failed", message)
  }
}
