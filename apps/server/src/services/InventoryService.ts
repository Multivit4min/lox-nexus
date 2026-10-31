import { Capabilities, type LoxoneSignalDto, type MiniserverDto, type PluginInstanceDto, type PluginPackageDto, type PluginSignalDto, type SignalDto, type StaleSignalDto, type WireDto } from "@lox-nexus/api"
import type { BusMessage, EventBus, SignalRegistry } from "@lox-nexus/core"
import { DataType } from "@lox-nexus/ici"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import { HttpError } from "../http/HttpError.ts"
import { SecretFields } from "../plugins/SecretFields.ts"

/** what the inventory reads; the same services the REST API lists from */
export interface InventorySources {
  miniservers: { list(): MiniserverDto[] }
  loxoneSignals: { list(miniserverId: string): LoxoneSignalDto[] }
  plugins: { list(): PluginInstanceDto[]; packages(): PluginPackageDto[] }
  pluginSignals: { list(instanceId: string): PluginSignalDto[] }
  signals: Pick<SignalRegistry, "list">
  bus: Pick<EventBus, "current" | "lastCommand" | "activeForces">
  wires: { list(): WireDto[] }
  stale: { list(): StaleSignalDto[] }
}

/** one signal with everything an agent asks about it, in one place */
export interface InventorySignal {
  id: string
  topic: string
  label: string
  /** "miniserver:<slug>", "plugin:<slug>", or "nexus" for system signals */
  owner: string
  /** in/out for Loxone signals (in: the Miniserver sends), sensor/actuator for plugin signals */
  dir: string
  valueType: string
  unit?: string
  decimals?: number
  packetId?: string
  dataType?: string
  capability?: string
  params?: unknown
  value?: Value
  /** epoch ms of that value */
  at?: number
  forced: boolean
  stale: boolean
  error?: string
  wires: number
}

/**
 * Joins what the REST API lists separately (signals, their Miniserver or plugin side, values,
 * forces, stale signals and wires) into one picture, for MCP's overview and lists. Read-only.
 */
export class InventoryService {
  private static readonly TYPE_NAMES = new Map<number, string>(Object.entries(DataType).map(([name, byte]) => [byte, name]))

  constructor(private readonly sources: InventorySources) {}

  miniservers() {
    return this.sources.miniservers.list()
  }

  instances() {
    return this.sources.plugins.list()
  }

  packages() {
    return this.sources.plugins.packages()
  }

  wires() {
    return this.sources.wires.list()
  }

  forces() {
    return this.sources.bus.activeForces()
  }

  signals(): InventorySignal[] {
    const miniservers = this.sources.miniservers.list()
    const instances = this.sources.plugins.list()
    const loxone = new Map(miniservers.flatMap(server => this.sources.loxoneSignals.list(server.id).map(signal => [signal.id, signal] as const)))
    const plugin = new Map(instances.flatMap(instance => this.sources.pluginSignals.list(instance.id).map(signal => [signal.id, this.withoutSecrets(signal, instance.plugin)] as const)))
    const owners = new Map<string, string>([...miniservers.map(server => [server.id, `miniserver:${server.slug}`] as const), ...instances.map(instance => [instance.id, `plugin:${instance.slug}`] as const)])
    const forced = new Set(this.sources.bus.activeForces().map(force => force.topic))
    const stale = new Set(this.sources.stale.list().map(entry => entry.signalId))
    const wires = this.wireCounts()
    return this.sources.signals.list().map(signal => {
      const current = this.sources.bus.current(signal.topic) ?? this.sources.bus.lastCommand(signal.topic)
      return {
        ...InventoryService.base(signal, owners),
        ...InventoryService.side(loxone.get(signal.id), plugin.get(signal.id)),
        ...InventoryService.value(current),
        forced: forced.has(signal.topic), stale: stale.has(signal.id), wires: wires.get(signal.id) ?? 0
      }
    })
  }

  /** a signal by its id or its topic */
  find(ref: string, signals = this.signals()) {
    return signals.find(signal => signal.id === ref || signal.topic === ref)
  }

  /** @throws HttpError 404, naming where agents find topics */
  require(ref: string, signals = this.signals()): InventorySignal {
    const found = this.find(ref, signals)
    if (!found) throw HttpError.notFound(`signal "${ref}" (list_signals names them)`)
    return found
  }

  /** what goes along when these signals go: the wires touching them, and how many are forced */
  impact(ids: ReadonlySet<string>, signals = this.signals()) {
    return {
      wires: this.wires().filter(wire => ids.has(wire.sourceId) || ids.has(wire.targetId)).length,
      forces: signals.filter(signal => ids.has(signal.id) && signal.forced).length
    }
  }

  // params a capability marks secret (and ones it doesn't declare) never reach an agent, like secret config fields
  private withoutSecrets(signal: PluginSignalDto, pluginId: string): PluginSignalDto {
    const description = this.sources.plugins.packages().find(pkg => pkg.id === pluginId)?.description
    const capability = Capabilities.of(description, signal)
    return { ...signal, params: capability ? new SecretFields(capability.params).strip(signal.params) : {} }
  }

  private wireCounts() {
    const counts = new Map<string, number>()
    for (const wire of this.sources.wires.list()) for (const id of [wire.sourceId, wire.targetId]) counts.set(id, (counts.get(id) ?? 0) + 1)
    return counts
  }

  private static base(signal: Omit<SignalDto, "current">, owners: Map<string, string>) {
    const owner = signal.owner ? owners.get(signal.owner.id) ?? `${signal.owner.kind}:${signal.owner.id}` : "nexus"
    return {
      id: signal.id, topic: signal.topic, label: signal.label, owner, dir: signal.direction, valueType: signal.valueType,
      ...(signal.unit ? { unit: signal.unit } : {}), ...(signal.decimals !== undefined ? { decimals: signal.decimals } : {})
    }
  }

  // what only the Miniserver or plugin side knows: packet id and data type, or capability and params
  private static side(loxone: LoxoneSignalDto | undefined, plugin: PluginSignalDto | undefined) {
    if (loxone) return { dir: loxone.direction, packetId: loxone.packetId, dataType: InventoryService.TYPE_NAMES.get(loxone.dataType) ?? `0x${loxone.dataType.toString(16)}` }
    if (plugin) return { dir: plugin.kind, capability: plugin.capability, params: plugin.params, ...(plugin.error ? { error: plugin.error } : {}) }
    return {}
  }

  private static value(message: BusMessage | undefined) {
    return message?.value ? { value: message.value, at: message.ts } : {}
  }
}
