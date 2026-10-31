import type { Client, Device, Port, Statistics, WifiOverview } from "../api/ApiSchemas.ts"
import { MacAddress } from "../api/MacAddress.ts"

/** what a poll read about the devices it looked at more closely, by device id */
export interface DeviceExtrasData {
  ports: Map<string, Port[]>
  statistics: Map<string, Statistics>
  /** why a device's ports couldn't be read */
  portProblems: Map<string, string>
  /** why a device's statistics couldn't be read; separate, as one read may fail while the other works */
  statisticsProblems: Map<string, string>
}

/** everything one poll read */
export interface NetworkData {
  at: number
  clients: readonly Client[]
  devices: readonly Device[]
  extras: DeviceExtrasData
  /** undefined when the list couldn't be read (see wifiProblem); the poll counts as good anyway */
  wifi: readonly WifiOverview[] | undefined
  wifiProblem?: string
}

/** One successful poll: the connected clients, the adopted devices, Wi-Fi networks and what was read on demand. */
export class NetworkSnapshot {
  constructor(private readonly data: NetworkData) {}

  get at() {
    return this.data.at
  }

  get clients() {
    return this.data.clients
  }

  get devices() {
    return this.data.devices
  }

  get extras() {
    return this.data.extras
  }

  get wifi() {
    return this.data.wifi
  }

  get wifiProblem() {
    return this.data.wifiProblem
  }

  device(mac: string) {
    return this.data.devices.find(device => MacAddress.equal(device.macAddress, mac))
  }

  /** the name of the device with this id, e.g. a client's access point */
  deviceName(id: string | undefined) {
    return id === undefined ? undefined : this.data.devices.find(device => device.id === id)?.name
  }

  /** where a client is connected: its access point or switch, "VPN" or "Teleport" for those, else "" */
  uplinkOf(client: Client) {
    const name = this.deviceName(client.uplinkDeviceId)
    if (name !== undefined) return name
    if (client.type === "VPN") return "VPN"
    return client.type === "TELEPORT" ? "Teleport" : ""
  }

  get devicesOnline() {
    return this.data.devices.filter(device => device.state === "ONLINE").length
  }
}
