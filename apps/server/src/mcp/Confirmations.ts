import { createHash, randomBytes } from "node:crypto"
import { Disposable, type Clock } from "@lox-nexus/plugin-sdk"

interface Pending {
  tokenId: string
  tool: string
  args: string
}

/**
 * The second step of a destructive tool: the first call answers what the change would take along
 * and a confirmation id; the same call with that id runs it. An id is bound to the token, the tool
 * and the exact arguments, works once, and expires after 5 minutes. It shows the agent (and a
 * client that asks before destructive tools) the blast radius; it doesn't stop an agent that
 * confirms on its own.
 */
export class Confirmations extends Disposable {
  static readonly TTL_MS = 5 * 60_000
  private readonly pending = new Map<string, Pending>()

  constructor(clock?: Clock) {
    super()
    this.useClock(clock)
  }

  /** @returns the id the second call passes as `confirmation` */
  create(tokenId: string, tool: string, args: unknown) {
    const id = randomBytes(9).toString("base64url")
    this.pending.set(id, { tokenId, tool, args: Confirmations.hash(args) })
    this.after(Confirmations.TTL_MS, () => this.pending.delete(id))
    return id
  }

  /** whether the id was made for this token, tool and arguments; it is used up either way */
  consume(id: string, tokenId: string, tool: string, args: unknown) {
    const entry = this.pending.get(id)
    this.pending.delete(id)
    return entry !== undefined && entry.tokenId === tokenId && entry.tool === tool && entry.args === Confirmations.hash(args)
  }

  // key order doesn't matter: the same arguments in another order are the same change
  private static hash(value: unknown) {
    return createHash("sha256").update(JSON.stringify(Confirmations.sorted(value))).digest("hex")
  }

  private static sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => Confirmations.sorted(item))
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, Confirmations.sorted(item)]))
    return value
  }
}
