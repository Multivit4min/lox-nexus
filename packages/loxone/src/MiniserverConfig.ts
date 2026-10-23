import { IciId } from "@lox-nexus/ici"
import { z } from "zod"

const iciId = z.string().refine(IciId.isValid, "1–8 printable ASCII characters")
const segment = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase topic segment")
const port = z.int().min(0).max(65535)

/** One Miniserver Nexus talks to. Validated because it comes from the database and the API. */
export const MiniserverConfigSchema = z.object({
  id: z.string().min(1),
  /** topic segment, e.g. "haus" in loxone/haus/in/... */
  slug: segment,
  label: z.string(),
  /** where the Miniserver listens for intercommunication packets */
  host: z.string().min(1),
  port: port.min(1),
  /** where Nexus listens; 0 picks a free port (tests) */
  listenPort: port,
  /** Nexus's ID as configured for this remote system on the Miniserver */
  ownId: iciId,
  /** the Miniserver's own ID */
  remoteId: iciId,
  /** @experimental decrypts 0x9F packets (sending stays unencrypted) */
  password: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
  /** cyclic resend of outputs in ms, 0 disables */
  resendInterval: z.int().min(0).max(86_400_000).default(10_000)
})

/** One packet id on a Miniserver, mapped to a bus signal. */
export const LoxoneSignalConfigSchema = z.object({
  id: z.string().min(1),
  packetId: iciId,
  /** in: Miniserver → Nexus, out: Nexus → Miniserver */
  direction: z.enum(["in", "out"]),
  /** ICI data type byte (0 digital … 6 tunable white) */
  dataType: z.int().min(0).max(6),
  label: z.string(),
  /** topic segment, defaults to the slug of the packet id */
  slug: segment.optional()
})

export type MiniserverConfig = z.infer<typeof MiniserverConfigSchema>
export type MiniserverConfigInput = z.input<typeof MiniserverConfigSchema>
export type LoxoneSignalConfig = z.infer<typeof LoxoneSignalConfigSchema>
export type LoxoneSignalConfigInput = z.input<typeof LoxoneSignalConfigSchema>
