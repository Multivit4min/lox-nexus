import { z, type PluginStore } from "@lox-nexus/plugin-sdk"
import type { WriteCoalescer } from "../matter/WriteCoalescer.ts"
import type { KindValue, StateKind } from "./DeviceKinds.ts"

const rememberedSchema = z.record(z.string(), z.union([z.boolean(), z.number()]))
type Remembered = z.infer<typeof rememberedSchema>

/**
 * The last state Nexus sent for the attributes matter.js doesn't persist itself (it does for
 * on/off, level, colour temperature, positions, fan speed and setpoints): contacts, motion, locks,
 * alarms, leaks, temperatures and humidity. Without them a restart would show every door closed
 * until it next changes, and showing it open again would start "door opens" routines although
 * nothing happened; temperatures would be unknown until Loxone happens to send again.
 */
export class DeviceMemory {
  static readonly PREFIX = "state:"
  static readonly KINDS: readonly StateKind[] = ["contact", "occupancy", "temperature", "humidity", "locked", "smoke", "co", "leak"]

  private readonly cache = new Map<string, Remembered>()

  /** @param coalescer merges bursts (a temperature every few seconds); without one each change is written at once */
  constructor(private readonly store: PluginStore, private readonly coalescer?: WriteCoalescer) {}

  get(endpointId: string, kind: StateKind): KindValue | undefined {
    return this.read(endpointId)[kind]
  }

  /** keeps the value if it is one matter.js doesn't persist and it changed */
  remember(endpointId: string, kind: StateKind, value: KindValue) {
    if (!DeviceMemory.KINDS.includes(kind) || typeof value === "object") return
    const current = this.read(endpointId)
    if (current[kind] === value) return
    const next = { ...current, [kind]: value }
    this.cache.set(endpointId, next)
    const key = DeviceMemory.PREFIX + endpointId
    const write = () => this.store.set(key, next)
    if (this.coalescer) this.coalescer.write(key, write)
    else write()
  }

  /** drops what is kept for a removed device */
  forget(endpointId: string) {
    const key = DeviceMemory.PREFIX + endpointId
    this.cache.delete(endpointId)
    this.coalescer?.drop(key)
    if (this.store.get(key) !== undefined) this.store.delete(key)
  }

  /** drops what is kept for devices no longer configured */
  keepOnly(endpointIds: readonly string[]) {
    const keep = new Set(endpointIds.map(id => DeviceMemory.PREFIX + id))
    for (const key of this.store.keys()) if (key.startsWith(DeviceMemory.PREFIX) && !keep.has(key)) this.store.delete(key)
  }

  private read(endpointId: string): Remembered {
    let remembered = this.cache.get(endpointId)
    if (!remembered) {
      // an older or damaged value is treated as nothing remembered
      remembered = rememberedSchema.safeParse(this.store.get(DeviceMemory.PREFIX + endpointId)).data ?? {}
      this.cache.set(endpointId, remembered)
    }
    return remembered
  }
}
