import type { BridgeItem, BridgeRequest, LoxoneSignalDto, PluginSignalDto, WireDto } from "@lox-nexus/api"
import type { CatalogEntry, PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { DataTypes, type DataTypeId } from "./DataTypes.ts"
import { PacketIds } from "./PacketIds.ts"

/** A plugin signal to connect to a Miniserver: one that exists, or a catalog entry to add. */
export interface BridgeCandidate {
  key: string
  label: string
  kind: "sensor" | "actuator"
  valueType: PluginSignalDto["valueType"]
  plugin: BridgeItem["plugin"]
}

/** One row of the dialog: the candidate and its Loxone signal as the user may change it. */
export interface BridgeRow {
  candidate: BridgeCandidate
  label: string
  packetId: string
  dataType: DataTypeId
}

/** Builds the rows of the "connect to a Miniserver" dialog and the request from them. */
export class BridgeDraft {
  static fromSignal(signal: PluginSignalDto): BridgeCandidate {
    return { key: signal.id, label: signal.label, kind: signal.kind, valueType: signal.valueType, plugin: { type: "existing", signalId: signal.id } }
  }

  static fromEntry(key: string, entry: CatalogEntry, description: PluginDescription): BridgeCandidate {
    const offered = entry.kind === "sensor" ? description.sensors : description.actuators
    const { kind, capability, params, label } = entry
    return {
      key, label, kind, valueType: offered.find(c => c.id === capability)?.valueType ?? "any",
      plugin: { type: "new", signal: { kind, capability, params, label } }
    }
  }

  /** suggests a packet id per row that no signal of the Miniserver uses yet, and the data type that fits the value */
  static rows(candidates: readonly BridgeCandidate[], takenPacketIds: Iterable<string>): BridgeRow[] {
    const ids = new PacketIds(takenPacketIds)
    return candidates.map(candidate => ({
      candidate, label: candidate.label, packetId: ids.suggest(candidate.label), dataType: DataTypes.forValueType(candidate.valueType)
    }))
  }

  /** packet ids of the Loxone signals each existing candidate is wired to already, by candidate key */
  static connected(candidates: readonly BridgeCandidate[], wires: readonly WireDto[], loxone: readonly LoxoneSignalDto[]) {
    const packets = new Map(loxone.map(signal => [signal.id, signal.packetId]))
    const result = new Map<string, string[]>()
    for (const candidate of candidates) {
      if (candidate.plugin.type !== "existing") continue
      const id = candidate.plugin.signalId
      const ends = wires.map(w => candidate.kind === "sensor" ? (w.sourceId === id ? w.targetId : "") : (w.targetId === id ? w.sourceId : ""))
      const ids = ends.flatMap(end => packets.get(end) ?? [])
      if (ids.length) result.set(candidate.key, ids)
    }
    return result
  }

  static request(miniserverId: string, rows: readonly BridgeRow[]): BridgeRequest {
    return {
      miniserverId,
      items: rows.map(row => ({
        plugin: row.candidate.plugin,
        loxone: { packetId: row.packetId.trim(), dataType: row.dataType, label: row.label.trim() || row.candidate.label }
      }))
    }
  }
}
