import { IciId } from "@lox-nexus/ici"
import { z } from "zod"

const iciId = z.string().refine(IciId.isValid, "1–8 printable ASCII characters")
const segment = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase topic segment")
const port = z.int().min(0).max(65535)

/** One Miniserver Nexus talks to. Validated because it comes from the database and the API. */
export const MiniserverConfigSchema = z.object({
  /** stable identity; wires and persistence refer to it, so it can't change */
  id: z.string().min(1),
  /** topic segment, e.g. "haus" in loxone/haus/in/... */
  slug: segment,
  label: z.string(),
  /** where the Miniserver listens for intercommunication packets */
  host: z.string().min(1),
  /** UDP port on the Miniserver; 0 is not valid here */
  port: port.min(1),
  /** where Nexus listens; 0 picks a free port (tests) */
  listenPort: port,
  /** local IPv4 address to bind, default all interfaces */
  listenAddress: z.ipv4().optional(),
  /** Nexus's ID as configured for this remote system on the Miniserver */
  ownId: iciId,
  /** the Miniserver's own ID */
  remoteId: iciId,
  /** @experimental decrypts 0x9F packets (sending stays unencrypted) */
  password: z.string().min(1).optional(),
  /** whether MiniserverManager.startEnabled() starts it */
  enabled: z.boolean().default(true),
  /** cyclic resend of outputs in ms, 0 disables */
  resendInterval: z.int().min(0).max(86_400_000).default(10_000)
})

/** One packet id on a Miniserver, mapped to a bus signal. */
export const LoxoneSignalConfigSchema = z.object({
  /** stable identity that wires refer to; survives topic changes */
  id: z.string().min(1),
  /** the ICI packet id (1-8 ASCII characters) as configured on the Miniserver */
  packetId: iciId,
  /** in: Miniserver → Nexus, out: Nexus → Miniserver */
  direction: z.enum(["in", "out"]),
  /** ICI data type byte (0 digital … 6 tunable white); a literal union so it types as DataType */
  dataType: z.literal([0, 1, 2, 3, 4, 5, 6]),
  label: z.string(),
  /** topic segment, defaults to the slug of the packet id */
  slug: segment.optional()
})

/** a validated Miniserver config, defaults applied */
export type MiniserverConfig = z.infer<typeof MiniserverConfigSchema>
/** what callers may pass in, before defaults are applied */
export type MiniserverConfigInput = z.input<typeof MiniserverConfigSchema>
/** a validated signal config */
export type LoxoneSignalConfig = z.infer<typeof LoxoneSignalConfigSchema>
/** what callers may pass in for a signal, before validation */
export type LoxoneSignalConfigInput = z.input<typeof LoxoneSignalConfigSchema>
