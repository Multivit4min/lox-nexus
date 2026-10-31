import type { Device } from "../api/ApiSchemas.ts"
import { MacAddress } from "../api/MacAddress.ts"
import type { NetworkApi } from "../api/NetworkApi.ts"
import type { SiteResolver } from "../poll/SiteResolver.ts"

/**
 * Restarts a device and power-cycles a PoE port, for the actuators and the panel's buttons alike.
 * Devices are named by MAC address; the API's id is looked up in a fresh device list, so a
 * command never goes to a stale id.
 */
export class DeviceCommands {
  constructor(private readonly api: Pick<NetworkApi, "devices" | "restart" | "powerCycle">, private readonly site: Pick<SiteResolver, "id">) {}

  /** @returns the device's name; @throws Error when the console doesn't know the device or refuses */
  async restart(mac: string) {
    const site = await this.site.id()
    const device = await this.find(site, mac)
    await this.api.restart(site, device.id)
    return device.name
  }

  /** @returns the device's name; @throws Error when the console doesn't know the device or refuses */
  async powerCycle(mac: string, port: number) {
    const site = await this.site.id()
    const device = await this.find(site, mac)
    await this.api.powerCycle(site, device.id, port)
    return device.name
  }

  private async find(site: string, mac: string): Promise<Device> {
    const device = (await this.api.devices(site)).find(entry => MacAddress.equal(entry.macAddress, mac))
    if (!device) throw new Error(`no device ${MacAddress.normalize(mac)} on the console`)
    return device
  }
}
