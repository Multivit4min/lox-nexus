import { Disposable } from "@lox-nexus/plugin-sdk"
import { Miniserver, type MiniserverDeps } from "./Miniserver.ts"
import { MiniserverConfigSchema, type MiniserverConfigInput } from "./MiniserverConfig.ts"

/** Owns all Miniservers. One failing Miniserver (e.g. a taken port) never stops the others. */
export class MiniserverManager extends Disposable {
  private readonly miniservers = new Map<string, Miniserver>()

  constructor(private readonly deps: MiniserverDeps) {
    super()
    this.onDispose(() => Promise.all([...this.miniservers.keys()].map(id => this.remove(id))).then(() => undefined))
  }

  /** validates and adds a Miniserver without starting it */
  add(input: MiniserverConfigInput): Miniserver {
    const config = MiniserverConfigSchema.parse(input)
    if (this.miniservers.has(config.id)) throw new Error(`miniserver "${config.id}" already exists`)
    const slugTaken = [...this.miniservers.values()].some(m => m.config.slug === config.slug)
    if (slugTaken) throw new Error(`slug "${config.slug}" is already used by another miniserver`)
    const miniserver = new Miniserver(config, this.deps)
    this.miniservers.set(config.id, miniserver)
    return miniserver
  }

  get(id: string) {
    return this.miniservers.get(id)
  }

  list(): Miniserver[] {
    return [...this.miniservers.values()]
  }

  /** starts every enabled Miniserver; returns the ones that failed with their error */
  async startEnabled(): Promise<Array<{ id: string; error: unknown }>> {
    const enabled = this.list().filter(m => m.config.enabled)
    const results = await Promise.allSettled(enabled.map(m => m.start()))
    return results.flatMap((result, i) => (result.status === "rejected" ? [{ id: enabled[i]!.config.id, error: result.reason as unknown }] : []))
  }

  /** stops the Miniserver, unregisters its signals and forgets it */
  async remove(id: string) {
    const miniserver = this.miniservers.get(id)
    if (!miniserver) return false
    this.miniservers.delete(id)
    await miniserver.dispose()
    return true
  }
}
