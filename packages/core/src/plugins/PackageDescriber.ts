import { PluginDescriptionSchema, type PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { PluginSession, type SessionTimings } from "./PluginSession.ts"
import { DEFAULT_TIMINGS } from "./PluginSupervisor.ts"
import type { OpenOptions, PluginTransport } from "./PluginTransport.ts"

/** Learns what a plugin offers by asking a throwaway worker, so the plugin itself never runs in the host. */
export class PackageDescriber {
  constructor(private readonly transport: PluginTransport, private readonly timings: SessionTimings = DEFAULT_TIMINGS) {}

  /** @throws Error when the module doesn't load, never says hello or answers with something else */
  async describe(entry: string, options: OpenOptions = {}): Promise<PluginDescription> {
    const session = new PluginSession(this.transport.open(entry, options), this.timings)
    try {
      await session.greet()
      return PluginDescriptionSchema.parse(await session.request({ type: "describe" }))
    } finally {
      await session.close()
    }
  }
}
