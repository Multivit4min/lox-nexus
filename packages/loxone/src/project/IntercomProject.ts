/**
 * One intercommunication signal of a peer, seen from Nexus: "in" is a Loxone Config output
 * (the Miniserver sends it), "out" is a Loxone Config input (the Miniserver receives it).
 */
export interface IntercomProjectSignal {
  packetId: string
  direction: "in" | "out"
  /** ICI data type byte; Loxone Config leaves it out for digital */
  dataType: number
  /** the object's name in Loxone Config */
  label: string
  description?: string
}

/** A remote system configured under a Miniserver's "Network Intercommunication". */
export interface IntercomPeer {
  /** the ICI id of the Miniserver this peer belongs to (a project may hold several) */
  miniserverId: string
  /** the port that Miniserver listens on */
  miniserverPort: number
  label: string
  /** the peer's own ICI id: Nexus' `ownId` when Nexus is this peer */
  id: string
  /** where the Miniserver sends to */
  host: string
  port: number
  encrypted: boolean
  signals: IntercomProjectSignal[]
}

/** What a Loxone Config project says about intercommunication; nothing else is kept. */
export interface IntercomProject {
  title: string
  /** when Loxone Config saved it, as written there ("2026-10-24 14:27:35", Miniserver local time) */
  savedAt?: string
  peers: IntercomPeer[]
}
