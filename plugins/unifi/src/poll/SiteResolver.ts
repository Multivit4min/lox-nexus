import type { Site } from "../api/ApiSchemas.ts"
import type { NetworkApi } from "../api/NetworkApi.ts"

/**
 * Finds the configured site once and remembers it: by id, name (ignoring case) or the internal
 * reference older APIs used ("default"). Without a configured site the console's first site is
 * used, which is the only one on most consoles.
 */
export class SiteResolver {
  private resolved: Site | undefined

  constructor(private readonly api: Pick<NetworkApi, "sites">, private readonly wanted: string) {}

  /** the site found last, for the panel */
  get current() {
    return this.resolved
  }

  /** @throws Error naming the sites there are when the configured one isn't among them */
  async id(): Promise<string> {
    this.resolved ??= SiteResolver.pick(await this.api.sites(), this.wanted.trim())
    return this.resolved.id
  }

  /** asks again next time, e.g. after a failure (the site may have been renamed) */
  forget() {
    this.resolved = undefined
  }

  private static pick(sites: Site[], wanted: string): Site {
    if (sites.length === 0) throw new Error("the console has no site")
    if (!wanted) return sites[0]!
    const lower = wanted.toLowerCase()
    const site = sites.find(entry => entry.id === wanted) ??
      sites.find(entry => entry.name.toLowerCase() === lower) ??
      sites.find(entry => entry.internalReference.toLowerCase() === lower)
    if (site) return site
    throw new Error(`no site "${wanted}" on the console; it has ${sites.map(entry => `"${entry.name}"`).join(", ")}`)
  }
}
