import type { SignalDto, WireDto } from "@lox-nexus/api"
import { shallowReactive } from "vue"
import type { AppContext } from "../AppContext.ts"
import type { LiveValues } from "./LiveValues.ts"
import { WireHealth, type OwnerStatus, type WireStatus } from "../lib/wires/WireHealth.ts"

/** A wire with its signals and status resolved, as the wire list shows it. */
export interface WireRow {
  wire: WireDto
  source?: SignalDto
  target?: SignalDto
  status: WireStatus
}

/**
 * Wires together with every signal and the Miniservers and plugin instances that own them, which
 * is what it takes to show a wire's ends and why it does or doesn't carry values. Values come live
 * from the stream (`rows(…, live)`); owner states change on their own, so the rest is reloaded
 * now and then.
 */
export class WireBoard {
  readonly state = shallowReactive({
    wires: [] as WireDto[],
    signals: new Map<string, SignalDto>() as ReadonlyMap<string, SignalDto>,
    owners: new Map<string, OwnerStatus>() as ReadonlyMap<string, OwnerStatus>,
    loaded: false
  })

  private requested = 0
  private running = 0

  constructor(private readonly context: Pick<AppContext, "wires" | "bus" | "miniservers" | "plugins">) {}

  /**
   * Answers can overtake each other (a poll started before a change lands after the reload that
   * follows the change), so only the latest request's answer is applied.
   */
  async load() {
    const { wires, bus, miniservers, plugins } = this.context
    const request = ++this.requested
    this.running++
    const answers = await Promise.all([wires.list(), bus.signals(), miniservers.list(), plugins.list()]).finally(() => this.running--)
    if (request !== this.requested) return
    const [list, signals, servers, instances] = answers
    Object.assign(this.state, {
      wires: list,
      signals: new Map(signals.map(signal => [signal.id, signal])),
      owners: WireHealth.owners(servers, instances),
      loaded: true
    })
  }

  /** a periodic reload: skipped while a load is still running, so a slow server doesn't pile them up */
  async poll() {
    if (this.running === 0) await this.load()
  }

  get health() {
    return new WireHealth(this.state.signals, this.state.owners)
  }

  /**
   * @param ownerId only wires with an end owned by this Miniserver or plugin instance
   * @param live values newer than the last load, from the stream; forces in it change the status too
   */
  rows(ownerId?: string, live?: Pick<LiveValues, "get">): WireRow[] {
    const signals = live ? WireBoard.withLive(this.state.signals, live) : this.state.signals
    const health = new WireHealth(signals, this.state.owners)
    const rows = this.state.wires.map(wire => ({
      wire, source: signals.get(wire.sourceId), target: signals.get(wire.targetId), status: health.of(wire)
    }))
    if (ownerId === undefined) return rows
    return rows.filter(row => row.source?.owner?.id === ownerId || row.target?.owner?.id === ownerId)
  }

  private static withLive(signals: ReadonlyMap<string, SignalDto>, live: Pick<LiveValues, "get">) {
    return new Map([...signals].map(([id, signal]) => {
      const current = live.get(signal.topic)
      return [id, current ? { ...signal, current } : signal] as const
    }))
  }

  /** target id → label of the wire feeding it; a target takes only one wire */
  fedTargets(): Map<string, string> {
    return new Map(this.state.wires.map(wire => [wire.targetId, wire.label || "unnamed wire"]))
  }

  /** e.g. Miniserver "Haus"; empty for signals without a known owner */
  ownerName(signal: SignalDto | undefined) {
    const owner = signal && this.health.ownerOf(signal)
    return owner ? WireHealth.describe(owner) : ""
  }
}
