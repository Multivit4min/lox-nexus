import { mock } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { CalendarPlugin } from "../CalendarPlugin.ts"
import { IcsServer } from "./IcsServer.ts"

/** What a test starts the plugin with. */
export interface StartOptions {
  /** the faked current time; default Monday 2026-11-02 08:00 UTC (09:00 in Vienna) */
  now?: string
  config?: Record<string, unknown>
  store?: Record<string, unknown>
}

/**
 * Starts CalendarPlugin instances against an IcsServer with a faked clock (setTimeout,
 * setInterval and Date), and stops them all in cleanup, so a failing test leaves nothing running.
 * Times in tests are UTC; the plugin's zone is Europe/Vienna (UTC+1 in November).
 */
export class CalendarHarness {
  static readonly NOW = "2026-11-02T08:00:00Z"
  private readonly hosts: PluginTestHost[] = []
  private clockOn = false

  private constructor(readonly server: IcsServer) {}

  static async create() {
    return new CalendarHarness(await IcsServer.start())
  }

  /** the plugin instance inside the host */
  static plugin(host: PluginTestHost) {
    return (host as unknown as { runtime: { plugin: CalendarPlugin } }).runtime.plugin
  }

  /** starts the clock at `now` unless it runs already */
  clock(now = CalendarHarness.NOW) {
    if (this.clockOn) return
    mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: Date.parse(now) })
    this.clockOn = true
  }

  /** starts the plugin on `path` of the server without waiting for the first read */
  async start(path: string, options: StartOptions = {}) {
    this.clock(options.now)
    const config = { url: this.server.url(path), timeZone: "Europe/Vienna", ...options.config }
    const host = await PluginTestHost.start(CalendarPlugin, { config, ...(options.store ? { store: options.store } : {}) })
    this.hosts.push(host)
    return host
  }

  /** starts the plugin and waits until the first read succeeded or failed */
  async started(path: string, options: StartOptions = {}) {
    const host = await this.start(path, options)
    await CalendarHarness.plugin(host).source.refresh()
    return host
  }

  /**
   * Advances the faked clock to an ISO time in steps. A single tick would set Date to its end
   * before running the timers due in it, so timers set from a callback would see the wrong time.
   */
  advanceTo(time: string, stepMs = 60_000) {
    const target = Date.parse(time)
    while (Date.now() < target) mock.timers.tick(Math.min(stepMs, target - Date.now()))
  }

  /** stops every host, then restores the real clock */
  async cleanup() {
    try {
      await Promise.all(this.hosts.splice(0).map(host => host.stop()))
    } finally {
      mock.timers.reset()
      this.clockOn = false
    }
  }

  async close() {
    try {
      await this.cleanup()
    } finally {
      await this.server.close()
    }
  }
}
