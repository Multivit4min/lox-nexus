import { PluginTestHost, TestClock } from "@lox-nexus/plugin-sdk/testing"
import { SchedulerPlugin } from "../SchedulerPlugin.ts"

/** What a test starts the plugin with. */
export interface StartOptions {
  config?: Record<string, unknown>
  store?: Record<string, unknown>
  /** the zone Nexus would send; default Europe/Vienna */
  timeZone?: string
}

/**
 * Starts SchedulerPlugin instances on one TestClock and stops them all in cleanup, so a failing
 * test leaves nothing running. Times in tests are UTC; the zone is Europe/Vienna (UTC+1 in
 * November), so 06:30 there is 05:30Z.
 */
export class SchedulerHarness {
  /** Monday 2026-11-02, 09:00 in Vienna */
  static readonly NOW = "2026-11-02T08:00:00Z"
  private readonly hosts: PluginTestHost<typeof SchedulerPlugin>[] = []
  readonly clock: TestClock

  constructor(now = SchedulerHarness.NOW) {
    this.clock = new TestClock(now)
  }

  async start(options: StartOptions = {}) {
    const host = await PluginTestHost.start(SchedulerPlugin, {
      clock: this.clock, timeZone: options.timeZone ?? "Europe/Vienna",
      ...(options.config ? { config: options.config } : {}), ...(options.store ? { store: options.store } : {})
    })
    this.hosts.push(host)
    return host
  }

  /** stops a host as Nexus would, and starts a new one on its store: a restart */
  async restart(host: PluginTestHost<typeof SchedulerPlugin>, options: StartOptions = {}) {
    await this.stop(host)
    return this.start({ ...options, store: structuredClone(host.store) })
  }

  async stop(host: PluginTestHost<typeof SchedulerPlugin>) {
    this.hosts.splice(this.hosts.indexOf(host), 1)
    await host.stop()
  }

  /** moves the clock to an ISO time, running every timer at its due time */
  async advanceTo(time: string) {
    await this.clock.advanceTo(time)
  }

  async cleanup() {
    await Promise.all(this.hosts.splice(0).map(host => host.stop()))
  }
}
