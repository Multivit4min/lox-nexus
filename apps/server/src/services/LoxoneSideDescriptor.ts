import { DataTypes, type LoxoneSignalDto, type MiniserverDto } from "@lox-nexus/api"

/** one object as Loxone Config needs it, next to the Nexus signal it pairs with */
export interface LoxoneSideObject {
  topic: string
  loxone: {
    /** what to create under the peer in Loxone Config */
    object: "intercommunication input" | "intercommunication output"
    meaning: string
    name: string
    packetId: string
    dataType: number
    dataTypeName: string
    /** lets a person or agent find the Nexus side from Loxone Config */
    description: string
    /** a suggestion in Loxone's format, e.g. "<v.1> W" */
    unitFormat?: string
  }
  /** the other end of the signal's wire in Nexus, if any */
  feeds?: string
}

/**
 * What Loxone Config needs so a Miniserver talks to Nexus: the peer device under its Network
 * Intercommunication, and one object per Loxone signal. Directions swap sides: a Nexus `out`
 * signal is an intercommunication input of the Miniserver, an `in` signal an output. The join key
 * is Miniserver, direction and packet id; names are free. Pure, so it is easy to test.
 */
export class LoxoneSideDescriptor {
  /**
   * @param nexusAddress the address the Miniserver reaches Nexus at, when known: Nexus can't tell
   *   it behind Docker or NAT, so an agent may pass what the user said
   * @param feeds per signal id, the topic at the other end of its wire
   */
  static describe(ms: MiniserverDto, signals: readonly LoxoneSignalDto[], feeds: ReadonlyMap<string, string>, nexusAddress?: string) {
    const listening = ms.listenAddress && !["0.0.0.0", "::"].includes(ms.listenAddress) ? ms.listenAddress : undefined
    const address = nexusAddress ?? listening
    return {
      miniserver: { slug: ms.slug, label: ms.label, iciId: ms.remoteId, port: ms.port },
      peer: {
        name: "Lox Nexus", iciId: ms.ownId, port: ms.boundPort ?? ms.listenPort,
        // must match: a password here means an encrypted peer there
        encrypted: ms.hasPassword,
        address: address ?? null,
        ...(address ? {} : { addressHint: "the address of the computer Nexus runs on, as the Miniserver reaches it; Nexus can't tell (Docker, NAT): ask the user or pass nexusAddress" })
      },
      objects: signals.map(signal => LoxoneSideDescriptor.object(signal, feeds.get(signal.id)))
    }
  }

  private static object(signal: LoxoneSignalDto, feeds: string | undefined): LoxoneSideObject {
    const receives = signal.direction === "out"
    const unitFormat = LoxoneSideDescriptor.unitFormat(signal)
    return {
      topic: signal.topic,
      loxone: {
        object: receives ? "intercommunication input" : "intercommunication output",
        meaning: receives ? "the Miniserver receives this value from Nexus" : "the Miniserver sends this value to Nexus",
        name: signal.label, packetId: signal.packetId, dataType: signal.dataType, dataTypeName: DataTypes.nameOf(signal.dataType),
        description: `Lox Nexus: ${signal.topic}`,
        ...(unitFormat ? { unitFormat } : {})
      },
      ...(feeds ? { feeds } : {})
    }
  }

  // only analog values carry a unit in Loxone; <v.1> is Loxone's own default
  private static unitFormat(signal: LoxoneSignalDto) {
    if (signal.dataType !== 1 || (signal.unit === undefined && signal.decimals === undefined)) return undefined
    const value = `<v.${signal.decimals ?? 1}>`
    return signal.unit ? `${value} ${signal.unit}` : value
  }
}
