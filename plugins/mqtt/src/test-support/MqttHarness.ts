import { PluginTestHost, type TestHostOptions } from "@lox-nexus/plugin-sdk/testing"
import { MqttPlugin } from "../MqttPlugin.ts"
import { TestBroker, type TestBrokerOptions } from "./TestBroker.ts"

export type MqttHost = PluginTestHost<typeof MqttPlugin>

/**
 * Starts a TestBroker and MqttPlugin hosts against it, and stops them all in cleanup, so a
 * failing assertion leaves no connection behind. Waits run on real event-loop turns.
 */
export class MqttHarness {
  private readonly hosts: MqttHost[] = []
  private current: TestBroker | undefined

  get broker() {
    if (!this.current) throw new Error("no broker started")
    return this.current
  }

  async open(options: TestBrokerOptions = {}) {
    this.current = await TestBroker.start(options)
    return this.current
  }

  /** restarts the broker on its port; retained messages are lost */
  async restartBroker() {
    this.current = await this.broker.restart()
    return this.current
  }

  /** starts the plugin against the broker; `config` overrides the defaults */
  async start(config: Record<string, unknown> = {}, options: Omit<TestHostOptions, "config"> = {}) {
    const host = await PluginTestHost.start(MqttPlugin, { config: { url: this.broker.url, ...config }, ...options })
    this.hosts.push(host)
    return host
  }

  /** starts and waits until connected */
  async connected(config: Record<string, unknown> = {}, options: Omit<TestHostOptions, "config"> = {}) {
    const host = await this.start(config, options)
    await MqttHarness.until(() => host.plugin.connection.connected)
    return host
  }

  /** stops one host now (cleanup won't stop it again) */
  async stop(host: MqttHost) {
    const index = this.hosts.indexOf(host)
    if (index >= 0) this.hosts.splice(index, 1)
    await host.stop()
  }

  async cleanup() {
    await Promise.all(this.hosts.splice(0).map(host => host.stop()))
  }

  async close() {
    try {
      await this.cleanup()
    } finally {
      await this.current?.close()
      this.current = undefined
    }
  }

  /** waits on real event-loop turns until done() holds */
  static async until(done: () => boolean, ms = 3000, what = "condition") {
    const start = performance.now()
    while (!done()) {
      if (performance.now() - start > ms) throw new Error(`timed out waiting for ${what}`)
      await new Promise<void>(resolve => setImmediate(resolve))
    }
  }

  /** signal errors and recoveries the plugin reported for a signal, in order */
  static signalStates(host: MqttHost, signalId: string) {
    return host.sent.flatMap(message => {
      if (message.type === "signal.error" && message.signalId === signalId) return [`error: ${message.error}`]
      if (message.type === "signal.recovered" && message.signalId === signalId) return ["recovered"]
      return []
    })
  }

  /** log lines of a level */
  static logs(host: MqttHost, level: string) {
    return host.sent.flatMap(message => (message.type === "log" && message.level === level ? [message.message] : []))
  }
}
