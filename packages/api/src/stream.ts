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
/** `pattern` is optional on input: it defaults to all topics (#) */
export type StreamRequest = z.input<typeof StreamRequestSchema>

/** Messages the server sends on the stream. */
export type StreamEvent =
  | { type: "bus"; messages: BusMessageDto[] }
  /** messages were dropped because the client could not keep up */
  | { type: "gap"; dropped: number }
  /**
   * full: the complete current state after subscribing (replace); otherwise changes since the last
   * batch (merge). cleared: topics that no longer have a value (a force was released before any
   * real value arrived), to be removed.
   */
  | { type: "state"; messages: BusMessageDto[]; full?: true; cleared?: string[] }
  /** every stale signal now (replace): sent with the state subscription, then whenever the set changes */
  | { type: "signal-status"; stale: StaleSignalDto[] }
  | { type: "error"; message: string }

/** A source that sent no value (not even an unchanged one) for longer than its `staleAfterMin`, while its owner runs. */
export interface StaleSignalDto {
  signalId: string
  topic: string
  /** epoch ms of its last value since the server started; absent when none came */
  lastSeen?: number
}

/** WebSocket close codes the UI reacts to. */
export const StreamCloseCode = {
  /** the server is shutting down: reconnect later */
  SHUTDOWN: 1001,
  /** logout, password change or expiry: go to the login page, don't reconnect */
  SESSION_ENDED: 4401
} as const
