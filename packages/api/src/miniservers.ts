import { z } from "zod"
import type { Value } from "@lox-nexus/plugin-sdk/values"

const iciId = z.string().min(1).max(8)
const segment = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase letters, digits, '.', '_' or '-'")
const port = z.int().min(0).max(65535)

/** POST/PUT body for a Miniserver. The server validates again with the Loxone package's schema. */
export const MiniserverInputSchema = z.object({
  slug: segment,
  label: z.string().max(100),
  host: z.string().min(1),
  port: port.min(1),
  /** the Miniserver sends to this port, so it has to be fixed (0 is only for tests) */
  listenPort: port.min(1),
  /** local IPv4 address to bind; default all interfaces */
  listenAddress: z.ipv4().optional(),
  ownId: iciId,
  remoteId: iciId,
  /** undefined keeps the stored password, null removes it */
  password: z.string().min(1).nullable().optional(),
  enabled: z.boolean().default(true),
  resendInterval: z.int().min(0).max(86_400_000).default(10_000)
})
export type MiniserverInput = z.input<typeof MiniserverInputSchema>

/** POST body for a Loxone signal; `id` is assigned by the server. */
export const LoxoneSignalInputSchema = z.object({
  packetId: iciId,
  direction: z.enum(["in", "out"]),
  /** ICI data type byte: 0 digital, 1 analog, 2 text, 3 T5, 4 RGBW, 5 single channel, 6 tunable white */
  dataType: z.literal([0, 1, 2, 3, 4, 5, 6]),
  label: z.string().max(100),
  slug: segment.optional()
})
export type LoxoneSignalInput = z.input<typeof LoxoneSignalInputSchema>

/** POST body to turn a discovered packet into an input signal; the data type comes from the packet. */
export const AdoptPacketSchema = z.object({
  packetId: iciId,
  label: z.string().max(100).optional(),
  slug: segment.optional()
})
export type AdoptPacket = z.infer<typeof AdoptPacketSchema>

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
  resendInterval: number
  running: boolean
  health: MiniserverHealthDto
  /** the bound port while running (differs from listenPort when that is 0) */
  boundPort?: number
  /** why the last start failed, cleared by a successful start */
  lastError?: string
}

export interface LoxoneSignalDto {
  id: string
  miniserverId: string
  packetId: string
  direction: "in" | "out"
  dataType: number
  label: string
  slug?: string
  topic: string
}

export interface DiscoveredPacketDto {
  packetId: string
  dataType: number
  value?: Value
  firstSeen: number
  lastSeen: number
}
