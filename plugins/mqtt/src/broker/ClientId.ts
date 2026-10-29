import { randomBytes } from "node:crypto"
import type { PluginStore } from "@lox-nexus/plugin-sdk"

/**
 * The client ID: the configured one, or `lox-nexus-<slug>-<random>` made once and kept in the
 * store, so the broker's logs show the same client after a restart, and two instances (or two
 * Nexus installations) never share one: brokers disconnect the older of two clients with one ID.
 */
export class ClientId {
  static readonly KEY = "clientId"

  static resolve(configured: string | undefined, slug: string | undefined, store: PluginStore) {
    if (configured) return configured
    const kept = store.get<unknown>(ClientId.KEY)
    if (typeof kept === "string" && /^lox-nexus-[\x21-\x7e]{1,100}$/.test(kept)) return kept
    const name = (slug ?? "nexus").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "nexus"
    const made = `lox-nexus-${name}-${randomBytes(4).toString("hex")}`
    store.set(ClientId.KEY, made)
    return made
  }
}
