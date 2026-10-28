import { mock } from "node:test"
import type { WatchedSignal } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { InfluxPlugin } from "../InfluxPlugin.ts"
import { FakeInflux } from "./FakeInflux.ts"

export type InfluxHost = PluginTestHost<typeof InfluxPlugin>

/**
 * Starts InfluxPlugin instances against a FakeInflux, with two chosen signals, and stops them all
 * in cleanup. `clock()` fakes setTimeout, setInterval and Date (at NOW); the fake's sockets still
 * run on real event-loop turns.
 */
export class InfluxHarness {
  static readonly NOW = Date.parse("2026-11-02T08:00:00Z")
  static readonly TOKEN = "s3cr3t-influx-token"
  static readonly SIGNALS: WatchedSignal[] = [
    { id: "t1", topic: "loxone/home/in/temperature", label: "Living room", valueType: "number", owner: { kind: "miniserver", id: "ms1" } },
    { id: "l1", topic: "hue/bridge/actuator/kitchen", label: "Kitchen light", valueType: "rgbw", owner: { kind: "plugin", id: "hue" } }
  ]

  private readonly hosts: InfluxHost[] = []
  private clockOn = false

  private constructor(readonly influx: FakeInflux) {}

  static async create() {
    return new InfluxHarness(await FakeInflux.start())
  }

  /** the v2 config against the fake, with overrides */
  config(overrides: Record<string, unknown> = {}) {
    return { url: this.influx.url, org: "home", bucket: "loxone", token: InfluxHarness.TOKEN, ...overrides }
  }

  clock() {
    if (this.clockOn) return
    mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: InfluxHarness.NOW })
    this.clockOn = true
  }

  /** starts the plugin and chooses the signals */
  async start(overrides: Record<string, unknown> = {}, signals = InfluxHarness.SIGNALS) {
    const host = await PluginTestHost.start(InfluxPlugin, { config: this.config(overrides) })
    this.hosts.push(host)
    await host.watchSignals(signals)
    return host
  }

  /** pushes numbers for t1 (one value each, a second apart) */
  static numbers(host: InfluxHost, values: number[], dropped = 0) {
    const ts = Date.now()
    return host.pushValues(values.map((value, index) => ({ signalId: "t1", ts: ts + index * 1000, value: { type: "number", value } })), dropped)
  }

  /** waits for `count` requests and for the writer to have handled the last answer */
  async written(host: InfluxHost, count: number) {
    const request = await this.influx.received(count)
    await host.plugin.writer.settled()
    return request
  }

  /** log lines of a level */
  static logs(host: InfluxHost, level: string) {
    return host.sent.flatMap(m => (m.type === "log" && m.level === level ? [m.message] : []))
  }

  /** stops one host now (cleanup won't stop it again) */
  async stop(host: InfluxHost) {
    const index = this.hosts.indexOf(host)
    if (index >= 0) this.hosts.splice(index, 1)
    await host.stop()
  }

  async cleanup() {
    try {
      await Promise.all(this.hosts.splice(0).map(host => host.stop()))
    } finally {
      if (this.clockOn) mock.timers.reset()
      this.clockOn = false
    }
  }

  async close() {
    try {
      await this.cleanup()
    } finally {
      await this.influx.close()
    }
  }
}
