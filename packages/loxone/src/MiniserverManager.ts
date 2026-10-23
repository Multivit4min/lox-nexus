import { Disposable } from "@lox-nexus/plugin-sdk"
import { Miniserver, type MiniserverDeps } from "./Miniserver.ts"
import { MiniserverConfigSchema, type MiniserverConfig, type MiniserverConfigInput } from "./MiniserverConfig.ts"

/**
 * Owns all Miniservers. One failing Miniserver (e.g. a taken port) never stops the others.
 * Disposing is shutdown (signals and therefore wires stay registered); remove() is deletion.
 */
export class MiniserverManager extends Disposable {
  private readonly miniservers = new Map<string, Miniserver>()

  constructor(private readonly deps: MiniserverDeps) {
    super()
    this.onDispose(async () => {
      const all = [...this.miniservers.values()]
      this.miniservers.clear()
      await Promise.all(all.map(m => m.dispose()))
    })
  }

  /**
   * Validates and adds a Miniserver without starting it; its signals are added through the returned instance.
   * @throws ZodError for an invalid config; Error for a duplicate id or a slug another Miniserver uses
   */
  add(input: MiniserverConfigInput): Miniserver {
    const config = MiniserverConfigSchema.parse(input)
    if (this.miniservers.has(config.id)) throw new Error(`miniserver "${config.id}" already exists`)
    this.assertSlugFree(config)
    const miniserver = new Miniserver(config, this.deps)
    this.miniservers.set(config.id, miniserver)
    return miniserver
  }

  /**
   * Validates and applies a new config, restarting the Miniserver if it was running.
   * @throws ZodError for an invalid config; Error for an unknown id or a slug another Miniserver uses
   */
  async update(id: string, input: MiniserverConfigInput) {
    const miniserver = this.miniservers.get(id)
    if (!miniserver) throw new Error(`unknown miniserver "${id}"`)
    const config = MiniserverConfigSchema.parse({ ...input, id })
    this.assertSlugFree(config)
    await miniserver.update(config)
    return miniserver
  }

  /** undefined for unknown ids */
  get(id: string) {
    return this.miniservers.get(id)
  }

  /** snapshot in insertion order */
  list(): Miniserver[] {
    return [...this.miniservers.values()]
  }

  /** starts every enabled Miniserver; returns the ones that failed with their error (also kept as lastError) */
  async startEnabled(): Promise<Array<{ id: string; error: unknown }>> {
    const enabled = this.list().filter(m => m.config.enabled)
    const results = await Promise.allSettled(enabled.map(m => m.start()))
    return results.flatMap((result, i) => (result.status === "rejected" ? [{ id: enabled[i]!.config.id, error: result.reason as unknown }] : []))
  }

  /** deletes: unregisters its signals (and so their wires), stops it and forgets it */
  async remove(id: string) {
    const miniserver = this.miniservers.get(id)
    if (!miniserver) return false
    this.miniservers.delete(id)
    miniserver.removeAllSignals()
    await miniserver.dispose()
    return true
  }

  private assertSlugFree(config: MiniserverConfig) {
    const taken = this.list().some(m => m.config.id !== config.id && m.config.slug === config.slug)
    if (taken) throw new Error(`slug "${config.slug}" is already used by another miniserver`)
  }
}
