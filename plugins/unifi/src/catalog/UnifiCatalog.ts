import type { CatalogNode } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Device, Port, Statistics } from "../api/ApiSchemas.ts"
import type { NetworkApi } from "../api/NetworkApi.ts"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import { VoucherActuator } from "../actuators/VoucherActuator.ts"
import { WifiEnabledActuator } from "../actuators/WifiEnabledActuator.ts"
import { VoucherCodeSensor } from "../sensors/VoucherCodeSensor.ts"
import { WifiEnabledSensor } from "../sensors/WifiEnabledSensor.ts"
import { CatalogIds } from "./CatalogIds.ts"
import { ClientEntries } from "./ClientEntries.ts"
import { DeviceEntries } from "./DeviceEntries.ts"

/**
 * What can be added, from the last poll: connected clients, devices with their ports, Wi-Fi
 * networks and vouchers. Ports of devices the poll didn't read are read now, once per browse.
 */
export class UnifiCatalog {
  constructor(private readonly snapshot: NetworkSnapshot, private readonly api: Pick<NetworkApi, "device" | "statistics">, private readonly site: string) {}

  async build(): Promise<CatalogNode[]> {
    const devices = await Promise.all([...this.snapshot.devices].sort((a, b) => a.name.localeCompare(b.name)).map(async device => {
      const [ports, statistics] = await Promise.all([this.ports(device.id, device.interfaces.includes("ports")), this.statistics(device)])
      return new DeviceEntries(device, ports, statistics).node()
    }))
    return [
      new ClientEntries(this.snapshot).node(),
      { label: "Devices", children: devices },
      this.wifi(),
      {
        label: "Vouchers",
        entries: [
          { kind: "sensor", capability: VoucherCodeSensor.id, params: {}, label: "Newest voucher code" },
          { kind: "actuator", capability: VoucherActuator.id, params: { minutes: 1440 }, label: "Create voucher (1 day)" }
        ]
      }
    ]
  }

  // a device that fails to answer shows without ports rather than failing the whole catalog
  private async ports(id: string, hasPorts: boolean): Promise<readonly Port[]> {
    const known = this.snapshot.extras.ports.get(id)
    if (known || !hasPorts) return known ?? []
    try {
      return (await this.api.device(this.site, id)).interfaces.ports.ports
    } catch {
      return []
    }
  }

  // what an online device reports now, so the catalog offers only those numbers, with their values;
  // offline or failing, nothing is known and every statistic is offered
  private async statistics(device: Device): Promise<Statistics | undefined> {
    if (device.state !== "ONLINE") return undefined
    const known = this.snapshot.extras.statistics.get(device.id)
    if (known) return known
    try {
      return await this.api.statistics(this.site, device.id)
    } catch {
      return undefined
    }
  }

  private wifi(): CatalogNode {
    const children = [...this.snapshot.wifi ?? []].sort((a, b) => a.name.localeCompare(b.name)).map(network => ({
      label: network.name,
      id: CatalogIds.wifi(network.id),
      entries: [
        { kind: "sensor" as const, capability: WifiEnabledSensor.id, params: { network: network.id }, label: `${network.name} on`, value: Value.boolean(network.enabled) },
        { kind: "actuator" as const, capability: WifiEnabledActuator.id, params: { network: network.id }, label: `${network.name} on/off`, value: Value.boolean(network.enabled) }
      ]
    }))
    return { label: "Wi-Fi networks", children }
  }
}
