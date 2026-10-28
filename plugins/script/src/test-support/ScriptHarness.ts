import { mock } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { ScriptPlugin } from "../ScriptPlugin.ts"

/**
 * Starts ScriptPlugin hosts with a given script and stops them all in cleanup, so a failing
 * assertion leaves no script timer behind. Restores the real clock afterwards.
 */
export class ScriptHarness {
  private readonly hosts: PluginTestHost[] = []
  private restoreRejections: (() => void) | undefined

  async start(script?: string, store?: Record<string, unknown>) {
    const host = await PluginTestHost.start(ScriptPlugin, {
      config: script === undefined ? {} : { script },
      ...(store ? { store } : {})
    })
    this.hosts.push(host)
    return host
  }

  /**
   * Hands this process's unhandled rejections to the host, as PluginEntry's handler does in a
   * worker, until cleanup. node:test's own listener would report them as test failures, so it is
   * set aside meanwhile; any rejection still shows up, as a log line of the plugin or the runtime.
   */
  forwardRejections(host: PluginTestHost) {
    const runner = process.listeners("unhandledRejection")
    const forward = (reason: unknown) => host.unhandledRejection(reason)
    process.removeAllListeners("unhandledRejection")
    process.on("unhandledRejection", forward)
    this.restoreRejections = () => {
      process.off("unhandledRejection", forward)
      for (const listener of runner) process.on("unhandledRejection", listener)
    }
  }

  async cleanup() {
    try {
      await Promise.all(this.hosts.splice(0).map(host => host.stop()))
      // rejections caused by the stop arrive a few turns later
      for (let turn = 0; turn < 5; turn++) await new Promise<void>(resolve => setImmediate(resolve))
    } finally {
      this.restoreRejections?.()
      this.restoreRejections = undefined
      mock.timers.reset()
    }
  }

  /** log lines the plugin sent, optionally of one level */
  static logs(host: PluginTestHost, level?: string): string[] {
    return host.sent.flatMap(message => (message.type === "log" && (level === undefined || message.level === level) ? [message.message] : []))
  }

  /** waits on real event-loop turns (not on faked timers) until done() holds */
  static async until(done: () => boolean, ms = 2000) {
    const start = performance.now()
    while (!done()) {
      if (performance.now() - start > ms) throw new Error("timed out")
      await new Promise<void>(resolve => setImmediate(resolve))
    }
  }

  /** the plugin instance inside the host (no SDK accessor yet, see the testing guide) */
  static plugin(host: PluginTestHost) {
    return (host as unknown as { runtime: { plugin: ScriptPlugin } }).runtime.plugin
  }
}
