import { z } from "zod"

/** FTP commands are lines, so a login can't contain line breaks or NUL */
const ftpField = z.string().min(1).max(200).regex(/^[^\r\n\0]*$/, "must not contain line breaks")

/** POST body to read a Miniserver's Loxone Config project over FTP; the login is used once and not stored. */
export const ProjectReadSchema = z.object({
  username: ftpField,
  password: ftpField
})
export type ProjectRead = z.infer<typeof ProjectReadSchema>

/** An intercommunication object, seen from Nexus: "in" is sent by the Miniserver, "out" received by it. */
export interface LoxoneProjectSignalDto {
  packetId: string
  direction: "in" | "out"
  /** ICI data type byte; may be one Nexus can't map */
  dataType: number
  /** the object's name in Loxone Config */
  label: string
  description?: string
}

/** A remote system under a Miniserver's Network Intercommunication. */
export interface LoxoneProjectPeerDto {
  /** the ICI id of the Miniserver it belongs to (Nexus' `remoteId`) */
  miniserverId: string
  /** the port that Miniserver listens on (Nexus' `port`) */
  miniserverPort: number
  label: string
  /** the peer's own ICI id (Nexus' `ownId` when Nexus is this peer) */
  id: string
  /** where the Miniserver sends to (Nexus' address and `listenPort`) */
  host: string
  port: number
  encrypted: boolean
  signals: LoxoneProjectSignalDto[]
}

/** POST /api/miniservers/:id/project: the intercommunication part of the Miniserver's current project. */
export interface LoxoneProjectDto {
  /** the file read, e.g. "sps_0274_20261024142743.zip" */
  file: string
  title: string
  /** as Loxone Config wrote it, in the Miniserver's local time */
  savedAt?: string
  /** the project's time zone (IANA, e.g. "Europe/Vienna"); Nexus keeps it for the plugins */
  timeZone?: string
  peers: LoxoneProjectPeerDto[]
}
