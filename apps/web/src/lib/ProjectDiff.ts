import type { LoxoneProjectDto, LoxoneProjectPeerDto, LoxoneProjectSignalDto, LoxoneSignalDto, LoxoneSignalInput, MiniserverDto } from "@lox-nexus/api"
import { DataTypes } from "./DataTypes.ts"

/**
 * new: not configured; same: configured with this type; differs: configured with another type;
 * unsupported: a type Nexus can't map; removed: configured here, but no longer in the project
 */
export type ProjectRowStatus = "new" | "same" | "differs" | "unsupported" | "removed"

/**
 * A project signal next to the configured signal with the same packet id and direction, if any.
 * A removed row has only the configured signal; `signal` then describes it the same way.
 */
export interface ProjectRow {
  key: string
  signal: LoxoneProjectSignalDto
  existing?: LoxoneSignalDto
  status: ProjectRowStatus
}

/** Compares a Miniserver's Loxone Config project with what Nexus has configured for it. */
export class ProjectDiff {
  /** the peer that is this Nexus (same own id, ideally the same Miniserver id), else the first */
  static peerFor(project: LoxoneProjectDto, ms: MiniserverDto): LoxoneProjectPeerDto | undefined {
    const own = project.peers.filter(peer => peer.id === ms.ownId)
    return own.find(peer => peer.miniserverId === ms.remoteId) ?? own[0] ?? project.peers[0]
  }

  /**
   * Inputs first, then outputs, each in project order, then the configured signals the project no
   * longer has; a packet id that appears twice in one direction is listed once.
   */
  static rows(peer: LoxoneProjectPeerDto, configured: LoxoneSignalDto[]): ProjectRow[] {
    const byKey = new Map(configured.map(signal => [ProjectDiff.key(signal), signal]))
    const seen = new Set<string>()
    const unique = peer.signals.filter(signal => !seen.has(ProjectDiff.key(signal)) && seen.add(ProjectDiff.key(signal)))
    const rows = unique.map(signal => {
      const existing = byKey.get(ProjectDiff.key(signal))
      return { key: ProjectDiff.key(signal), signal, ...(existing ? { existing } : {}), status: ProjectDiff.status(signal, existing) }
    })
    const removed = configured.filter(signal => !seen.has(ProjectDiff.key(signal))).map(existing => ({
      key: ProjectDiff.key(existing),
      signal: { packetId: existing.packetId, direction: existing.direction, dataType: existing.dataType, label: existing.label },
      existing,
      status: "removed" as const
    }))
    return [...rows.filter(row => row.signal.direction === "in"), ...rows.filter(row => row.signal.direction === "out"), ...removed]
  }

  /** the configured signals the project no longer has, which an import may delete */
  static removed(rows: ProjectRow[]): Array<ProjectRow & { existing: LoxoneSignalDto }> {
    return rows.filter((row): row is ProjectRow & { existing: LoxoneSignalDto } => row.status === "removed" && row.existing !== undefined)
  }

  /** rows an import changes something for, which are preselected */
  static actionable(row: ProjectRow) {
    return row.status === "new" || row.status === "differs"
  }

  /**
   * What importing a row sends: a new signal is named as in Loxone Config; an existing one keeps
   * its label and slug (so its topic, wires and force stay) and only takes the project's data type.
   * @throws Error for a row whose data type Nexus can't map
   */
  static inputFor(row: ProjectRow): LoxoneSignalInput {
    const dataType = DataTypes.ALL.find(type => type.id === row.signal.dataType)?.id
    if (dataType === undefined) throw new Error(`data type ${row.signal.dataType} is not supported`)
    const { packetId, direction } = row.signal
    if (!row.existing) return { packetId, direction, dataType, label: row.signal.label.slice(0, 100) }
    const { label, slug, unit, decimals } = row.existing
    // a full replace: unit and decimals stay while it is still a number
    const display = dataType === 1 ? { ...(unit ? { unit } : {}), ...(decimals === undefined ? {} : { decimals }) } : {}
    return { packetId, direction, dataType, label, ...(slug === undefined ? {} : { slug }), ...display }
  }

  /** where the peer's settings disagree with the Miniserver's; ICI only works when they match */
  static mismatches(peer: LoxoneProjectPeerDto, ms: MiniserverDto): string[] {
    const found: string[] = []
    if (peer.miniserverId !== ms.remoteId) found.push(`The Miniserver's ICI ID is "${peer.miniserverId}" in the project, "${ms.remoteId}" here (Remote ID).`)
    if (peer.id !== ms.ownId) found.push(`This peer's ICI ID is "${peer.id}" in the project, "${ms.ownId}" here (Own ID).`)
    if (peer.miniserverPort !== ms.port) found.push(`The Miniserver listens on port ${peer.miniserverPort} in the project, ${ms.port} here.`)
    if (peer.port !== ms.listenPort) found.push(`The Miniserver sends to port ${peer.port} in the project, Nexus listens on ${ms.listenPort}.`)
    if (peer.encrypted && !ms.hasPassword) found.push("The peer is encrypted in the project, but no password is set here.")
    if (!peer.encrypted && ms.hasPassword) found.push("A password is set here, but the peer is not encrypted in the project.")
    return found
  }

  /** e.g. "Analog → Smart RGBW" for a row whose type differs */
  static typeChange(row: ProjectRow) {
    return `${DataTypes.nameOf(row.existing?.dataType ?? row.signal.dataType)} → ${DataTypes.nameOf(row.signal.dataType)}`
  }

  private static status(signal: LoxoneProjectSignalDto, existing: LoxoneSignalDto | undefined): ProjectRowStatus {
    if (!DataTypes.ALL.some(type => type.id === signal.dataType)) return "unsupported"
    if (!existing) return "new"
    return existing.dataType === signal.dataType ? "same" : "differs"
  }

  private static key(signal: { direction: string; packetId: string }) {
    return `${signal.direction}:${signal.packetId}`
  }
}
