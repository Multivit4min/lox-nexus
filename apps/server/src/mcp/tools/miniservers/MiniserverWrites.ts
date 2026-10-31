import { MiniserverInputSchema, type MiniserverDto, type MiniserverInput } from "@lox-nexus/api"
import { z } from "zod"

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

/**
 * The same fields for a change: all optional and without their defaults, which zod would
 * otherwise fill in for every field left out (a disabled Miniserver would come back enabled).
 */
const shape = MiniserverFields.shape
export const MiniserverChanges = z.object({
  slug: shape.slug.optional(), label: shape.label.optional(), host: shape.host.optional(),
  port: shape.port.unwrap().optional(), listenPort: shape.listenPort.unwrap().optional(), listenAddress: shape.listenAddress,
  ownId: shape.ownId.optional(), remoteId: shape.remoteId.optional(),
  enabled: shape.enabled.unwrap().optional(), resendInterval: shape.resendInterval.unwrap().optional()
} satisfies Record<keyof typeof shape, z.ZodType>).strict()

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
