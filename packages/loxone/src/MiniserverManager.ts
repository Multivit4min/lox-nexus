import { DomainError } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { Miniserver, type MiniserverDeps } from "./Miniserver.ts"
import { MiniserverConfigSchema, type MiniserverConfig, type MiniserverConfigInput } from "./MiniserverConfig.ts"
import { SocketPool } from "./SocketPool.ts"

/**
 * Owns all Miniservers. One failing Miniserver (e.g. a taken port) never stops the others.
 * Disposing is shutdown (signals and therefore wires stay registered); remove() is deletion.
 *
 * Miniservers may share a listen address and port (one socket, see SocketPool). Packets are told
 * apart by their sender and receiver ids, so Miniservers on the same port must differ in the
 * Miniserver id or in our id.
 */
export class MiniserverManager extends Disposable {
  private readonly miniservers = new Map<string, Miniserver>()
  private readonly deps: MiniserverDeps

  constructor(deps: MiniserverDeps) {
    super()
    this.deps = { ...deps, sockets: deps.sockets ?? new SocketPool() }
    this.onDispose(async () => {
      const all = [...this.miniservers.values()]
      this.miniservers.clear()
      await Promise.all(all.map(m => m.dispose()))
    })
  }

  /**
   * Validates and adds a Miniserver without starting it; its signals are added through the returned instance.
   * @throws ZodError for an invalid config; Error for a duplicate id, a slug another Miniserver
   * uses, or a listen port shared with a Miniserver that has the same ids
   */
  add(input: MiniserverConfigInput): Miniserver {
    const config = MiniserverConfigSchema.parse(input)
    if (this.miniservers.has(config.id)) throw new DomainError("miniserver-exists", `miniserver "${config.id}" already exists`)
    this.assertFree(config)
    const miniserver = new Miniserver(config, this.deps)
    this.miniservers.set(config.id, miniserver)
    return miniserver
  }

  /**
   * Validates and applies a new config, restarting the Miniserver if it was running.
   * @throws ZodError for an invalid config; Error for an unknown id, a slug another Miniserver
   * uses, or a listen port shared with a Miniserver that has the same ids
   */
  async update(id: string, input: MiniserverConfigInput) {
    const miniserver = this.miniservers.get(id)
    if (!miniserver) throw new DomainError("unknown-miniserver", `unknown miniserver "${id}"`)
    const config = MiniserverConfigSchema.parse({ ...input, id })
    this.assertFree(config)
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

  private assertFree(config: MiniserverConfig) {
    const others = this.list().map(m => m.config).filter(other => other.id !== config.id)
    if (others.some(other => other.slug === config.slug)) throw new DomainError("slug-taken", `slug "${config.slug}" is already used by another miniserver`)
    // on a shared socket both would receive the same packets; port 0 is never shared
    const twin = config.listenPort === 0 ? undefined : others.find(other =>
      other.listenPort === config.listenPort && other.listenAddress === config.listenAddress &&
      other.ownId === config.ownId && other.remoteId === config.remoteId)
    if (twin) {
      throw new DomainError("port-taken", `miniserver "${twin.label || twin.slug}" already listens on port ${config.listenPort} with the same ids; ` +
        "Miniservers sharing a port need a different Miniserver ID or our ID")
    }
  }
}
