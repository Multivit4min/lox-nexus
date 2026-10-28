import { PluginTestHost, TestClock } from "@lox-nexus/plugin-sdk/testing"
import { CalendarPlugin } from "../CalendarPlugin.ts"
import { IcsServer } from "./IcsServer.ts"

/** What a test starts the plugin with. */
export interface StartOptions {
  /** the clock's start time; default Monday 2026-11-02 08:00 UTC (09:00 in Vienna) */
  now?: string
  config?: Record<string, unknown>
  store?: Record<string, unknown>
}

/**
 * Starts CalendarPlugin instances against an IcsServer on one TestClock, and stops them all in
 * cleanup, so a failing test leaves nothing running. Times in tests are UTC; the plugin's zone is
 * Europe/Vienna (UTC+1 in November).
 */
export class CalendarHarness {
  static readonly NOW = "2026-11-02T08:00:00Z"
  private readonly hosts: PluginTestHost[] = []
  private current: TestClock | undefined

  private constructor(readonly server: IcsServer) {}

  static async create() {
    return new CalendarHarness(await IcsServer.start())
  }

  /** the plugin instance inside the host */
  static plugin(host: PluginTestHost) {
    return host.plugin as CalendarPlugin
  }

  /** the clock of the running test, started at `now` unless it runs already */
  clock(now = CalendarHarness.NOW) {
    this.current ??= new TestClock(now)
    return this.current
  }

  /** starts the plugin on `path` of the server without waiting for the first read */
  async start(path: string, options: StartOptions = {}) {
    const clock = this.clock(options.now)
    const config = { url: this.server.url(path), timeZone: "Europe/Vienna", ...options.config }
    const host = await PluginTestHost.start(CalendarPlugin, { config, clock, ...(options.store ? { store: options.store } : {}) })
    this.hosts.push(host)
    return host
  }

  /** starts the plugin and waits until the first read succeeded or failed */
  async started(path: string, options: StartOptions = {}) {
    const host = await this.start(path, options)
    await CalendarHarness.plugin(host).source.refresh()
    return host
  }

  /** moves the clock to an ISO time, running every timer at its due time */
  async advanceTo(time: string) {
    await this.clock().advanceTo(time)
  }

  /** stops every host, then forgets the clock */
  async cleanup() {
    try {
      await Promise.all(this.hosts.splice(0).map(host => host.stop()))
    } finally {
      this.current = undefined
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
