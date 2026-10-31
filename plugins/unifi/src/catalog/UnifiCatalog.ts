import type { CatalogNode } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Port } from "../api/ApiSchemas.ts"
import type { NetworkApi } from "../api/NetworkApi.ts"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import { VoucherActuator } from "../actuators/VoucherActuator.ts"
import { WifiEnabledActuator } from "../actuators/WifiEnabledActuator.ts"
import { VoucherCodeSensor } from "../sensors/VoucherCodeSensor.ts"
import { WifiEnabledSensor } from "../sensors/WifiEnabledSensor.ts"
import { ClientEntries } from "./ClientEntries.ts"
import { DeviceEntries } from "./DeviceEntries.ts"

/**
 * What can be added, from the last poll: connected clients, devices with their ports, Wi-Fi
 * networks and vouchers. Ports of devices the poll didn't read are read now, once per browse.
 */
export class UnifiCatalog {
  constructor(private readonly snapshot: NetworkSnapshot, private readonly api: Pick<NetworkApi, "device">, private readonly site: string) {}

  async build(): Promise<CatalogNode[]> {
    const devices = await Promise.all([...this.snapshot.devices].sort((a, b) => a.name.localeCompare(b.name))
      .map(async device => new DeviceEntries(device, await this.ports(device.id, device.interfaces.includes("ports"))).node()))
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
      return (await this.api.device(this.site, id)).interfaces.ports ?? []
    } catch {
      return []
    }
  }

  private wifi(): CatalogNode {
    const children = [...this.snapshot.wifi ?? []].sort((a, b) => a.name.localeCompare(b.name)).map(network => ({
      label: network.name,
      entries: [
        { kind: "sensor" as const, capability: WifiEnabledSensor.id, params: { network: network.name }, label: `${network.name} on`, value: Value.boolean(network.enabled) },
        { kind: "actuator" as const, capability: WifiEnabledActuator.id, params: { network: network.name }, label: `${network.name} on/off`, value: Value.boolean(network.enabled) }
      ]
    }))
    return { label: "Wi-Fi networks", children }
  }
}
