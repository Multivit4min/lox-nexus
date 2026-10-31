import type { WifiDetails, WifiOverview } from "../api/ApiSchemas.ts"
import type { NetworkApi } from "../api/NetworkApi.ts"
import type { SiteResolver } from "../poll/SiteResolver.ts"

/** what a switch did */
export interface WifiSwitchResult {
  name: string
  changed: boolean
}

/**
 * Turns a Wi-Fi network (the API's "Wifi broadcast") on or off. The API has no partial update:
 * PUT takes the whole "Wifi broadcast create or update" object, so this reads the details, changes
 * `enabled` and sends everything else back as it was. The details carry the network's passphrase,
 * so the object is never logged, returned or shown.
 */
export class WifiSwitch {
  // fields of "Wifi broadcast details" that "Wifi broadcast create or update" doesn't have
  private static readonly READ_ONLY = ["id", "metadata"] as const

  constructor(private readonly api: Pick<NetworkApi, "wifiBroadcasts" | "wifiBroadcast" | "updateWifiBroadcast">, private readonly site: Pick<SiteResolver, "id">) {}

  /** by the network's id; @throws Error when it doesn't exist or the console refuses */
  async setById(id: string, enabled: boolean): Promise<WifiSwitchResult> {
    const site = await this.site.id()
    const details = await this.api.wifiBroadcast(site, id)
    if (details.enabled === enabled) return { name: details.name, changed: false }
    await this.api.updateWifiBroadcast(site, id, WifiSwitch.update(details, enabled))
    return { name: details.name, changed: true }
  }

  /** by the network's name (SSID), as signals name it; @throws Error for no or several matches */
  async setByName(name: string, enabled: boolean): Promise<WifiSwitchResult> {
    const network = WifiSwitch.pick(await this.api.wifiBroadcasts(await this.site.id()), name)
    return this.setById(network.id, enabled)
  }

  /** the one network with this name, ignoring case; also used by the sensor */
  static pick(networks: readonly WifiOverview[], name: string): WifiOverview {
    const wanted = name.trim().toLowerCase()
    const found = networks.filter(network => network.name.trim().toLowerCase() === wanted)
    if (found.length === 1) return found[0]!
    throw new Error(found.length === 0 ? `no Wi-Fi network named "${name}"` : `${found.length} Wi-Fi networks are named "${name}"`)
  }

  private static update(details: WifiDetails, enabled: boolean): Omit<WifiDetails, "id"> {
    const body: Record<string, unknown> = { ...details, enabled }
    for (const field of WifiSwitch.READ_ONLY) delete body[field]
    return body as Omit<WifiDetails, "id">
  }
}
