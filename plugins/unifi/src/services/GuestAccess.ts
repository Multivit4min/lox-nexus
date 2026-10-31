import type { NetworkApi } from "../api/NetworkApi.ts"
import { ClientMatch } from "../poll/ClientMatch.ts"
import type { SiteResolver } from "../poll/SiteResolver.ts"
import type { ClientParams } from "../params/ClientParams.ts"

/**
 * Authorizes or unauthorizes a guest client (the API's guest access actions). The API acts on
 * connected clients only, so the client is looked up in a fresh list of connected clients, and
 * only a client with GUEST access can be authorized.
 */
export class GuestAccess {
  constructor(private readonly api: Pick<NetworkApi, "clients" | "guestAccess">, private readonly site: Pick<SiteResolver, "id">) {}

  /**
   * @returns what happened, as a sentence
   * @throws Error when the client isn't connected (authorizing) or isn't a guest, or the console refuses
   */
  async set(params: ClientParams, authorize: boolean, minutes?: number): Promise<string> {
    const site = await this.site.id()
    const match = new ClientMatch(params)
    const client = match.find(await this.api.clients(site))[0]
    if (!client) {
      if (!authorize) return `${match.describe()} isn't connected, so there is nothing to unauthorize`
      throw new Error(`${match.describe()} isn't connected; UniFi authorizes connected guests only`)
    }
    if (client.access.type !== "GUEST") throw new Error(`${client.name} isn't a guest (its access is ${client.access.type})`)
    await this.api.guestAccess(site, client.id, authorize, minutes)
    if (!authorize) return `Unauthorized ${client.name}`
    return `Authorized ${client.name}${minutes === undefined ? " for the site's default time" : ` for ${minutes} min`}`
  }
}
