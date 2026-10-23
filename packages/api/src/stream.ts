import { z } from "zod"
import type { BusMessageDto } from "./bus.ts"

/**
 * Messages a client sends on the /api/stream WebSocket.
 * - bus: every recorded message matching the pattern, batched
 * - state: the current value per matching topic, coalesced (only the latest per topic is sent)
 */
export const StreamRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscribe"), stream: z.enum(["bus", "state"]), pattern: z.string().min(1).max(512).default("#") }),
  z.object({ type: z.literal("unsubscribe"), stream: z.enum(["bus", "state"]) })
])
export type StreamRequest = z.input<typeof StreamRequestSchema>

/** Messages the server sends on the stream. */
export type StreamEvent =
  | { type: "bus"; messages: BusMessageDto[] }
  /** messages were dropped because the client could not keep up */
  | { type: "gap"; dropped: number }
  | { type: "state"; messages: BusMessageDto[] }
  | { type: "error"; message: string }
