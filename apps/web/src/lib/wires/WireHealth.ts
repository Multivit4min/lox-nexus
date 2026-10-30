import type { MiniserverDto, PluginInstanceDto, SignalDto, StaleSignalDto, WireDto } from "@lox-nexus/api"

/** A Miniserver or plugin instance as far as wires care: its name and whether values get through. */
export interface OwnerStatus {
  kind: "miniserver" | "plugin"
  id: string
  label: string
  /** values sent to it arrive: the Miniserver or plugin runs */
  accepts: boolean
  /** values come from it: a running plugin, or a Miniserver that is heard from */
  delivers: boolean
  /** how its state reads after "is", e.g. "stopped", "in error", "silent (stale)" */
  phrase: string
}

/**
 * ok: values flow. idle: the wire runs, but nothing reaches the target right now (an owner is
 * stopped, the target is forced). off: switched off. broken: the server can't run it.
 */
export type WireLevel = "ok" | "idle" | "off" | "broken"

export interface WireStatus {
  level: WireLevel
  text: string
}

const PLUGIN_PHRASES: Record<PluginInstanceDto["state"], string> = {
  stopped: "stopped", starting: "starting", running: "running", degraded: "degraded", error: "in error",
  crashed: "crashed", stopping: "stopping", unavailable: "not installed"
}
const MINISERVER_PHRASES: Record<MiniserverDto["health"], string> = {
  stopped: "stopped", waiting: "waiting for its first packet", online: "online", stale: "silent (stale)"
}

/** Tells for each wire whether values flow and, when they don't, why, in words for the user. */
export class WireHealth {
  /** @param stale a source that went quiet (its owner runs, but it sends nothing) idles its wires */
  constructor(
    private readonly signals: ReadonlyMap<string, SignalDto>,
    private readonly owners: ReadonlyMap<string, OwnerStatus>,
    private readonly stale: (topic: string) => StaleSignalDto | undefined = () => undefined
  ) {}

  static owners(miniservers: readonly MiniserverDto[], instances: readonly PluginInstanceDto[]): Map<string, OwnerStatus> {
    const owners = new Map<string, OwnerStatus>()
    for (const ms of miniservers) {
      const health = ms.running ? ms.health : "stopped"
      owners.set(ms.id, { kind: "miniserver", id: ms.id, label: ms.label, accepts: ms.running, delivers: health === "online", phrase: MINISERVER_PHRASES[health] })
    }
    for (const instance of instances) {
      const running = instance.state === "running" || instance.state === "degraded"
      owners.set(instance.id, { kind: "plugin", id: instance.id, label: instance.label, accepts: running, delivers: running, phrase: PLUGIN_PHRASES[instance.state] })
    }
    return owners
  }

  /** e.g. Miniserver "Haus", plugin "Fronius" */
  static describe(owner: OwnerStatus) {
    return `${owner.kind === "miniserver" ? "Miniserver" : "plugin"} "${owner.label}"`
  }

  of(wire: WireDto): WireStatus {
    if (!wire.active) return { level: "broken", text: wire.problem ?? "not running" }
    if (!wire.enabled) return { level: "off", text: "switched off: forwards nothing" }
    const source = this.signals.get(wire.sourceId)
    const target = this.signals.get(wire.targetId)
    if (!source || !target) return { level: "broken", text: "one of its signals is gone" }
    const from = this.ownerOf(source)
    if (from && !from.delivers) return { level: "idle", text: `no values while ${WireHealth.describe(from)} is ${from.phrase}` }
    if (this.stale(source.topic)) {
      const limit = source.staleAfterMin === undefined ? "" : ` for longer than ${source.staleAfterMin} min`
      return { level: "idle", text: `source stale: "${source.label}" sent no value${limit}` }
    }
    const to = this.ownerOf(target)
    if (to && !to.accepts) return { level: "idle", text: `values don't reach ${WireHealth.describe(to)} while it is ${to.phrase}` }
    if (target.current?.flags?.forced) return { level: "idle", text: `"${target.label}" is forced: its subscribers see the forced value, not this wire's` }
    if (source.current?.flags?.forced) return { level: "ok", text: `"${source.label}" is forced: the wire carries the forced value` }
    return { level: "ok", text: "values flow" }
  }

  ownerOf(signal: SignalDto) {
    return signal.owner ? this.owners.get(signal.owner.id) : undefined
  }
}
