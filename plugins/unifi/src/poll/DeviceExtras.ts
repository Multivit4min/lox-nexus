import type { Device, Port } from "../api/ApiSchemas.ts"
import { MacAddress } from "../api/MacAddress.ts"
import type { NetworkApi } from "../api/NetworkApi.ts"
import type { DeviceExtrasData } from "./NetworkSnapshot.ts"
import type { PollDemand } from "./PollDemand.ts"

/**
 * Reads port details of switching devices (for the panel's ports and their power-cycle buttons)
 * and of devices a port signal needs, and latest statistics only of devices a signal needs them
 * of. Statistics are read of online devices only: an offline device has none to report. A device
 * whose read fails gets a problem; the poll and the other devices go on.
 */
export class DeviceExtras {
  constructor(private readonly api: Pick<NetworkApi, "device" | "statistics">, private readonly demand: PollDemand) {}

  async read(site: string, devices: readonly Device[]): Promise<DeviceExtrasData> {
    const data: DeviceExtrasData = { ports: new Map(), statistics: new Map(), portProblems: new Map(), statisticsProblems: new Map() }
    const ports = this.demand.targets("ports")
    const statistics = this.demand.targets("statistics")
    const reads: Promise<void>[] = []
    for (const device of devices) {
      const mac = MacAddress.normalize(device.macAddress)
      if (ports.has(mac) || device.features.includes("switching")) reads.push(this.ports(site, device, data))
      if (statistics.has(mac) && device.state === "ONLINE") reads.push(this.statistics(site, device, data))
    }
    await Promise.all(reads)
    return data
  }

  private async ports(site: string, device: Device, data: DeviceExtrasData) {
    try {
      const details = await this.api.device(site, device.id)
      data.ports.set(device.id, details.interfaces.ports ?? ([] as Port[]))
    } catch (error) {
      data.portProblems.set(device.id, `${device.name}: ${DeviceExtras.message(error)}`)
    }
  }

  private async statistics(site: string, device: Device, data: DeviceExtrasData) {
    try {
      data.statistics.set(device.id, await this.api.statistics(site, device.id))
    } catch (error) {
      data.statisticsProblems.set(device.id, `${device.name}: ${DeviceExtras.message(error)}`)
    }
  }

  private static message(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}
