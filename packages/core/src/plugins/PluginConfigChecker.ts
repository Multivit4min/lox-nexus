import { z } from "zod"
import { PluginSession, type SessionTimings } from "./PluginSession.ts"
import { DEFAULT_TIMINGS } from "./PluginSupervisor.ts"
import type { PluginTransport } from "./PluginTransport.ts"
import type { PluginPackage } from "./PluginTypes.ts"

const CheckAnswerSchema = z.object({
  issues: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() })),
  config: z.unknown(),
  version: z.int().min(1),
  /** what the migration wrote to the copy of the instance's store, when one was passed */
  store: z.object({ set: z.record(z.string(), z.unknown()), delete: z.array(z.string()) }).optional()
})
/** What a settings check found: the issues at their fields, and the (migrated) config to save with its version. */
export type ConfigCheck = z.infer<typeof CheckAnswerSchema>

/**
 * Checks settings and runs Test connection in a throwaway worker, like PackageDescriber: the
 * plugin's code runs, but never as a running instance of it.
 */
export class PluginConfigChecker {
  constructor(private readonly transport: PluginTransport, private readonly timings: SessionTimings = DEFAULT_TIMINGS) {}

  /**
   * @returns undefined for a plugin built before checks existed: its own start checks then
   * @throws Error when the module doesn't load or answers with something else
   */
  check(pkg: Pick<PluginPackage, "entry" | "heapMb">, config: unknown, configVersion?: number, store?: Record<string, unknown>): Promise<ConfigCheck | undefined> {
    return this.run(pkg, async session => {
      if (!session.supports("config.check")) return undefined
      const request = { type: "config.check" as const, config, ...(configVersion === undefined ? {} : { configVersion }), ...(store ? { store } : {}) }
      return CheckAnswerSchema.parse(await session.request(request))
    })
  }

  /** @throws PluginRequestError with the test's message, also for an invalid config or a plugin without a test */
  test(pkg: Pick<PluginPackage, "entry" | "heapMb">, config: unknown): Promise<string | undefined> {
    return this.run(pkg, async session => {
      if (!session.supports("config.check")) throw new Error("this version of the plugin can't test a connection")
      // a plugin's own connect timeout may be longer than a request's (a calendar's up to 120 s)
      const answer = await session.request({ type: "config.test", config }, this.timings.actionMs)
      return typeof answer === "string" ? answer : undefined
    })
  }

  private async run<T>(pkg: Pick<PluginPackage, "entry" | "heapMb">, work: (session: PluginSession) => Promise<T>) {
    const session = new PluginSession(this.transport.open(pkg.entry, pkg.heapMb === undefined ? {} : { heapMb: pkg.heapMb }), this.timings)
    try {
      await session.greet()
      return await work(session)
    } finally {
      await session.close()
    }
  }
}
