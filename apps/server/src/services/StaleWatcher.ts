import type { StaleSignalDto } from "@lox-nexus/api"
import type { Clock, EventBus, PluginManager, Signal, SignalOwner, SignalRegistry } from "@lox-nexus/core"
import type { MiniserverManager } from "@lox-nexus/loxone"
import { Disposable, type Listenable } from "@lox-nexus/plugin-sdk"

/** What the stale watcher works with; built in NexusApp. */
export interface StaleWatcherDeps {
  /** its registered, updated and unregistered events trigger a check at once */
  signals: Pick<SignalRegistry, "list"> & Listenable
  bus: Pick<EventBus, "lastSeen">
  /** whether the owner runs and is reachable; a stopped or offline owner shows that itself, its signals aren't stale */
  active: (owner: SignalOwner) => boolean
  clock: Clock
}

/**
 * Finds sources that went quiet: a signal with `staleAfterMin` whose last value (an unchanged
 * repeat counts) is older than that, while its Miniserver or plugin instance is active. The time
 * counts at the earliest from when the owner became active and from when the signal was first
 * watched with its topic and limit, so a restart, a new signal or a rename gets its full time.
 * Checked every CHECK_MS and on every registry change; listeners hear the whole set when it changes.
 */
export class StaleWatcher extends Disposable {
  static readonly CHECK_MS = 30_000
  private stale = new Map<string, StaleSignalDto>()
  private readonly activeSince = new Map<string, number>()
  /** per signal id: since when it is watched with this topic and limit */
  private readonly watched = new Map<string, { topic: string; limit: number; since: number }>()
  private readonly listeners = new Set<(stale: StaleSignalDto[]) => void>()

  constructor(private readonly deps: StaleWatcherDeps) {
    super()
    this.every(StaleWatcher.CHECK_MS, () => this.check())
    for (const event of ["registered", "updated", "unregistered"]) this.listen(deps.signals, event, () => this.check())
    this.onDispose(() => this.listeners.clear())
  }

  /**
   * A Miniserver counts while online, a plugin instance while running. A degraded instance (its
   * device unreachable) already says so itself, like a Miniserver that went silent.
   */
  static activeIn(miniservers: Pick<MiniserverManager, "get">, plugins: Pick<PluginManager, "get">) {
    return (owner: SignalOwner) => owner.kind === "miniserver" ? miniservers.get(owner.id)?.health === "online" : plugins.get(owner.id)?.state === "running"
  }

  /** the stale signals now */
  list(): StaleSignalDto[] {
    return [...this.stale.values()]
  }

  onChange(listener: (stale: StaleSignalDto[]) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** runs on its timer and on registry changes; public for tests */
  check() {
    const now = this.deps.clock.now()
    const next = new Map<string, StaleSignalDto>()
    const owners = new Set<string>()
    const watched = new Set<string>()
    for (const signal of this.deps.signals.list()) {
      const found = this.staleness(signal, now, owners, watched)
      if (found) next.set(signal.id, found)
    }
    // an owner that stopped, and a signal no longer watched, start over when they come back
    for (const key of this.activeSince.keys()) if (!owners.has(key)) this.activeSince.delete(key)
    for (const id of this.watched.keys()) if (!watched.has(id)) this.watched.delete(id)
    if (StaleWatcher.same(this.stale, next)) return
    this.stale = next
    const list = this.list()
    for (const listener of [...this.listeners]) listener(list)
  }

  private staleness(signal: Signal, now: number, owners: Set<string>, watched: Set<string>): StaleSignalDto | undefined {
    if (signal.direction !== "source" || !signal.owner || !this.deps.active(signal.owner)) return undefined
    const key = `${signal.owner.kind}:${signal.owner.id}`
    owners.add(key)
    const ownerSince = this.activeSince.get(key) ?? now
    this.activeSince.set(key, ownerSince)
    const limit = signal.staleAfterMin
    if (limit === undefined) return undefined
    watched.add(signal.id)
    const previous = this.watched.get(signal.id)
    const watchedSince = previous?.topic === signal.topic && previous.limit === limit ? previous.since : now
    this.watched.set(signal.id, { topic: signal.topic, limit, since: watchedSince })
    const lastSeen = this.deps.bus.lastSeen(signal.topic)
    if (now - Math.max(lastSeen ?? 0, ownerSince, watchedSince) < limit * 60_000) return undefined
    return { signalId: signal.id, topic: signal.topic, ...(lastSeen === undefined ? {} : { lastSeen }) }
  }

  // the same signals on the same topics; lastSeen of a stale signal doesn't change while it stays stale
  private static same(a: Map<string, StaleSignalDto>, b: Map<string, StaleSignalDto>) {
    return a.size === b.size && [...a].every(([id, entry]) => b.get(id)?.topic === entry.topic)
  }
}
