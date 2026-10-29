import { computed, shallowRef } from "vue"
import type { WireDto } from "@lox-nexus/api"
import type { WireApi } from "../api/WireApi.ts"

/** The wires at one end of a signal. */
export interface SignalWires {
  /** wires this signal feeds */
  out: WireDto[]
  /** the wire feeding it (a target takes one) */
  in: WireDto[]
}

const NONE: SignalWires = { out: [], in: [] }

/**
 * Which signals have wires, for the marks in signal lists. Lists load it when they mount and when
 * their signals change (a deleted signal takes its wires along); the wires card reloads it after
 * its own changes. Only the latest answer applies, so a slow earlier load can't bring back what a
 * later change replaced.
 */
export class WiredSignals {
  private readonly wires = shallowRef<WireDto[]>([])
  private requests = 0
  private readonly bySignal = computed(() => {
    const map = new Map<string, SignalWires>()
    const of = (id: string) => map.get(id) ?? map.set(id, { out: [], in: [] }).get(id)!
    for (const wire of this.wires.value) {
      of(wire.sourceId).out.push(wire)
      of(wire.targetId).in.push(wire)
    }
    return map
  })

  constructor(private readonly api: Pick<WireApi, "list">) {}

  /** a plain read; call load() to fill it */
  of(signalId: string): SignalWires {
    return this.bySignal.value.get(signalId) ?? NONE
  }

  /** a failure keeps what was there; the next list or change loads again */
  async load() {
    const request = ++this.requests
    const wires = await this.api.list().catch(() => undefined)
    if (wires && request === this.requests) this.wires.value = wires
  }
}
