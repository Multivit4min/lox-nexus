import { ApiError } from "./api/ApiError.ts"
import { NetworkApi } from "./api/NetworkApi.ts"
import { UnifiClient } from "./api/UnifiClient.ts"
import { ConsoleAddress } from "./config/ConsoleAddress.ts"
import type { UnifiConfig } from "./config/UnifiConfig.ts"
import { ConsoleTransport } from "./http/ConsoleTransport.ts"
import { TlsPolicy } from "./http/TlsPolicy.ts"
import { SiteResolver } from "./poll/SiteResolver.ts"

/** Test connection: reads the application info and finds the site with the key. Read only. */
export class ConnectionTest {
  static async run(config: UnifiConfig) {
    const address = ConsoleAddress.parse(config.host)
    const transport = new ConsoleTransport(address, TlsPolicy.fromConfig(config), config.apiKey, config.timeout * 1000)
    try {
      const api = new NetworkApi(new UnifiClient(transport))
      const info = await api.info()
      const site = new SiteResolver(api, config.site)
      await site.id()
      return `Connected to UniFi Network ${info.applicationVersion} at ${address.origin}, site "${site.current?.name}"`
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw new Error(`${error.message}; create a key under Settings › Control Plane › Integrations`, { cause: error })
      throw error
    } finally {
      await transport.dispose()
    }
  }
}
