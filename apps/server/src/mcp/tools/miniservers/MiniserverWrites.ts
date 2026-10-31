import { MiniserverInputSchema, type MiniserverDto, type MiniserverInput } from "@lox-nexus/api"
import type { z } from "zod"

/** what the Miniserver tools call: MiniserverService, as the REST controller does */
export interface MiniserverWrites {
  create(input: MiniserverInput): Promise<MiniserverDto>
  update(id: string, input: MiniserverInput): Promise<MiniserverDto>
  remove(id: string, by: string): Promise<void>
  start(id: string): Promise<MiniserverDto>
  stop(id: string): Promise<MiniserverDto>
}

/** a Miniserver's settings without the password: unknown keys (a password) are refused, not dropped */
export const MiniserverFields = MiniserverInputSchema.omit({ password: true }).strict()

/** what the tools answer about a Miniserver */
export class MiniserverAnswer {
  static of(ms: MiniserverDto) {
    const { slug, label, host, port, listenPort, ownId, remoteId, enabled, running, health, hasPassword } = ms
    return {
      slug, label, host, port, listenPort, ownId, remoteId, enabled, running, health,
      ...(ms.lastError ? { lastError: ms.lastError } : {}),
      encrypted: hasPassword,
      page: `#/miniservers/${ms.id}`
    }
  }

  /** the stored settings as input, for a change that gives only some fields */
  static input(ms: MiniserverDto): z.input<typeof MiniserverFields> {
    const { slug, label, host, port, listenPort, listenAddress, ownId, remoteId, enabled, resendInterval } = ms
    return { slug, label, host, port, listenPort, ...(listenAddress ? { listenAddress } : {}), ownId, remoteId, enabled, resendInterval }
  }
}
