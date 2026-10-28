import { mock } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { ScriptPlugin } from "../ScriptPlugin.ts"

/**
 * Starts ScriptPlugin hosts with a given script and stops them all in cleanup, so a failing
 * assertion leaves no script timer behind. Restores the real clock afterwards.
 */
export class ScriptHarness {
  private readonly hosts: PluginTestHost[] = []

  /** `forwardRejections`: the process's unhandled rejections go to the script, as in a worker */
  async start(script?: string, store?: Record<string, unknown>, forwardRejections = false) {
    const host = await PluginTestHost.start(ScriptPlugin, {
      forwardRejections,
      config: script === undefined ? {} : { script },
      ...(store ? { store } : {})
    })
    this.hosts.push(host)
    return host
  }

  async cleanup() {
    try {
      await Promise.all(this.hosts.splice(0).map(host => host.stop()))
    } finally {
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

  /** the plugin instance inside the host */
  static plugin(host: PluginTestHost) {
    return host.plugin as ScriptPlugin
  }
}
