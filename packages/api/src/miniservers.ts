import { z } from "zod"
import type { Value, ValueType } from "@lox-nexus/plugin-sdk/values"

/** ICI ids are at most 8 characters on the wire */
const iciId = z.string().min(1).max(8)
/** one topic segment: lowercase so topics are case-stable */
const segment = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase letters, digits, '.', '_' or '-'")
/** a UDP port; 0 means ephemeral */
const port = z.int().min(0).max(65535)

/** Loxone's intercommunication port; the Miniserver and Nexus both use it unless configured otherwise */
export const DEFAULT_ICI_PORT = 61263

/** POST/PUT body for a Miniserver. The server validates again with the Loxone package's schema. */
export const MiniserverInputSchema = z.object({
  slug: segment,
  label: z.string().max(100),
  host: z.string().min(1),
  /** defaults to Loxone's intercommunication port */
  port: port.min(1).default(DEFAULT_ICI_PORT),
  /** the Miniserver sends to this port, so it has to be fixed (0 is only for tests); Miniservers may share it */
  listenPort: port.min(1).default(DEFAULT_ICI_PORT),
  /** local IPv4 address to bind; default all interfaces */
  listenAddress: z.ipv4().optional(),
  ownId: iciId,
  remoteId: iciId,
  /** undefined keeps the stored password, null removes it */
  password: z.string().min(1).nullable().optional(),
  enabled: z.boolean().default(true),
  /** ms between re-sends of unchanged outputs; 0 disables */
  resendInterval: z.int().min(0).max(86_400_000).default(10_000)
})
/** `port`, `listenPort`, `enabled` and `resendInterval` are optional on input because the schema defaults them */
export type MiniserverInput = z.input<typeof MiniserverInputSchema>

/** POST body for a Loxone signal; `id` is assigned by the server. */
export const LoxoneSignalInputSchema = z.object({
  packetId: iciId,
  direction: z.enum(["in", "out"]),
  /** ICI data type byte: 0 digital, 1 analog, 2 text, 3 T5, 4 RGBW, 5 single channel, 6 tunable white */
  dataType: z.literal([0, 1, 2, 3, 4, 5, 6]),
  label: z.string().max(100),
  slug: segment.optional(),
  /** a Loxone colour number (Lumitech output): Analog signals and RGBW inputs only, checked by the server */
  lumitech: z.boolean().optional()
})
export type LoxoneSignalInput = z.input<typeof LoxoneSignalInputSchema>

/** Where a signal may carry Loxone colour numbers; the server's signal schema enforces the same rule. */
export class LumitechRule {
  /** Analog signals carry the number itself; an RGBW input may carry its bytes (see PROTOCOL.md) */
  static allowed(dataType: number, direction: "in" | "out") {
    return dataType === 1 || (dataType === 4 && direction === "in")
  }
}

/** POST body to turn a discovered packet into an input signal; the data type comes from the packet. */
export const AdoptPacketSchema = z.object({
  packetId: iciId,
  label: z.string().max(100).optional(),
  slug: segment.optional()
})
export type AdoptPacket = z.infer<typeof AdoptPacketSchema>

/** stopped: not running; waiting: running, nothing received yet; online: receiving; stale: packets stopped arriving */
export type MiniserverHealthDto = "stopped" | "waiting" | "online" | "stale"

/** A Miniserver as the UI sees it. The password is never sent back, only whether one is set. */
export interface MiniserverDto {
  id: string
  slug: string
  label: string
  host: string
  port: number
  listenPort: number
  listenAddress?: string
  ownId: string
  remoteId: string
  hasPassword: boolean
  enabled: boolean
  /** ms; 0 disables re-sending */
  resendInterval: number
  running: boolean
  health: MiniserverHealthDto
  /** the bound port while running (differs from listenPort when that is 0) */
  boundPort?: number
  /** why the last start failed, cleared by a successful start */
  lastError?: string
  /** intercommunication load in percent of Loxone's limit (35 messages/s averaged over 2 minutes) */
  load: number
}

/**
 * GET /api/miniservers/:id/signal-load: each signal's share of Loxone's intercommunication limit,
 * in percent (3 decimals), by signal id: a 2-minute average of the packets in the signal's own
 * direction, resends included. Signals without traffic are left out.
 */
export type SignalLoadDto = Record<string, number>

/** One point of a Miniserver's load history; rates are 2-minute averages in messages per second. */
export interface LoadSampleDto {
  ts: number
  incomingPerSecond: number
  outgoingPerSecond: number
  percent: number
}

/**
 * What the current load is made of, each in percent of the limit like `current.percent`, which
 * they add up to. Only `signals` shows up in the signal list; the rest belongs to no signal.
 */
export interface LoadBreakdownDto {
  /** the configured signals together (their shares in the signal list) */
  signals: number
  /** data the Miniserver sends for packet ids without a signal (see the discovered packets) */
  unconfigured: number
  /** the Miniserver's packets for other targets that arrive on this port */
  otherTargets: number
  /** encrypted packets Nexus can't read without the password */
  encrypted: number
  /** the status heartbeat and encryption handshakes */
  protocol: number
  /** the rest: signals deleted, or given a new packet id, within the last windowSeconds */
  recentlyChanged: number
}

/** GET /api/miniservers/:id/load */
export interface MiniserverLoadDto {
  /** Loxone's documented limit: messages per second, averaged over windowSeconds */
  limitPerSecond: number
  windowSeconds: number
  /** how often a sample is taken */
  sampleMs: number
  current: LoadSampleDto
  breakdown: LoadBreakdownDto
  /** up to the last hour, oldest first; stored by the server, so it survives restarts (downtime shows as a gap) */
  history: LoadSampleDto[]
}

/** A configured Loxone signal; `topic` is where it appears on the bus. */
export interface LoxoneSignalDto {
  id: string
  miniserverId: string
  packetId: string
  direction: "in" | "out"
  /** ICI data type byte, see LoxoneSignalInputSchema */
  dataType: number
  label: string
  slug?: string
  /** carries Loxone colour numbers, decoded into tunableWhite or rgbw */
  lumitech?: boolean
  topic: string
  /** the bus value type the data type maps to, e.g. "number" for analog; "any" for Lumitech signals */
  valueType: ValueType | "any"
}

/** A packet id the Miniserver sent although no signal is configured for it. */
export interface DiscoveredPacketDto {
  packetId: string
  dataType: number
  /** the last value seen */
  value?: Value
  /** epoch ms */
  firstSeen: number
  /** epoch ms */
  lastSeen: number
}
