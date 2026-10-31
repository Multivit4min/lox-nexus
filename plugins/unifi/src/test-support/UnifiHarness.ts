import { PluginTestHost, TestClock } from "@lox-nexus/plugin-sdk/testing"
import { UnifiPlugin } from "../UnifiPlugin.ts"
import { FakeConsole } from "./FakeConsole.ts"
import type { Json } from "./Fixtures.ts"

/**
 * A running plugin against a fake console, on a TestClock: polls run only when the test moves
 * the clock (one interval at a time, so a request's own timeout never fires while it is on the
 * network) or asks for one.
 */
export class UnifiHarness {
  static readonly START = "2026-10-31T08:00:00Z"

  private constructor(readonly fake: FakeConsole, readonly host: PluginTestHost<typeof UnifiPlugin>, readonly clock: TestClock) {}

  static async start(options: { config?: Json; store?: Record<string, unknown>; prepare?: (fake: FakeConsole) => void } = {}) {
    const fake = await FakeConsole.start()
    options.prepare?.(fake)
    const clock = new TestClock(UnifiHarness.START)
    try {
      const host = await PluginTestHost.start(UnifiPlugin, { config: fake.config(options.config), clock, store: options.store ?? {} })
      await host.plugin.poller.idle()
      return new UnifiHarness(fake, host, clock)
    } catch (error) {
      await fake.close()
      throw error
    }
  }

  get plugin() {
    return this.host.plugin
  }

  /** moves the clock by one poll interval (15 s by default) and waits for the poll that started */
  async tick(ms = 15_000) {
    await this.clock.advance(ms)
    await this.plugin.poller.idle()
  }

  /** the signal errors the plugin reported for a signal */
  errors(signalId: string) {
    return this.host.sent.flatMap(message => (message.type === "signal.error" && message.signalId === signalId ? [message.error] : []))
  }

  async stop() {
    try {
      await this.host.stop()
    } finally {
      await this.fake.close()
    }
  }
}
