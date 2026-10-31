import type { CatalogEntry, CatalogNode } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Device, Port } from "../api/ApiSchemas.ts"
import { MacAddress } from "../api/MacAddress.ts"
import { DeviceRestartActuator } from "../actuators/DeviceRestartActuator.ts"
import { PortPowerCycleActuator } from "../actuators/PortPowerCycleActuator.ts"
import { DeviceCpuSensor } from "../sensors/DeviceCpuSensor.ts"
import { DeviceMemorySensor } from "../sensors/DeviceMemorySensor.ts"
import { DeviceOnlineSensor } from "../sensors/DeviceOnlineSensor.ts"
import { DeviceStateSensor } from "../sensors/DeviceStateSensor.ts"
import { DeviceUpdateSensor } from "../sensors/DeviceUpdateSensor.ts"
import { DeviceUplinkRxSensor } from "../sensors/DeviceUplinkRxSensor.ts"
import { DeviceUplinkTxSensor } from "../sensors/DeviceUplinkTxSensor.ts"
import { DeviceUptimeSensor } from "../sensors/DeviceUptimeSensor.ts"
import { PortLinkSensor } from "../sensors/PortLinkSensor.ts"
import { PortPoeSensor } from "../sensors/PortPoeSensor.ts"
import { PortSpeedSensor } from "../sensors/PortSpeedSensor.ts"

const STATISTICS = [DeviceCpuSensor, DeviceMemorySensor, DeviceUptimeSensor, DeviceUplinkRxSensor, DeviceUplinkTxSensor]

/** One device in the catalog: its state, statistics, restart, and a node per port. */
export class DeviceEntries {
  constructor(private readonly device: Device, private readonly ports: readonly Port[]) {}

  node(): CatalogNode {
    const node: CatalogNode = { label: `${this.device.name} (${this.device.model})`, entries: this.entries() }
    if (this.ports.length > 0) node.children = [...this.ports].sort((a, b) => a.idx - b.idx).map(port => this.portNode(port))
    return node
  }

  private entries(): CatalogEntry[] {
    const params = { device: MacAddress.normalize(this.device.macAddress) }
    const name = this.device.name
    return [
      { kind: "sensor", capability: DeviceOnlineSensor.id, params, label: `${name} online`, value: Value.boolean(this.device.state === "ONLINE") },
      { kind: "sensor", capability: DeviceStateSensor.id, params, label: `${name} state`, value: Value.string(this.device.state) },
      { kind: "sensor", capability: DeviceUpdateSensor.id, params, label: `${name} firmware update`, value: Value.boolean(this.device.firmwareUpdatable) },
      ...STATISTICS.map(type => ({ kind: "sensor" as const, capability: type.id, params, label: `${name} ${type.label.toLowerCase()}`, unit: type.unit })),
      { kind: "actuator", capability: DeviceRestartActuator.id, params, label: `${name} restart` }
    ]
  }

  private portNode(port: Port): CatalogNode {
    const params = { device: MacAddress.normalize(this.device.macAddress), port: port.idx }
    const label = `${this.device.name} port ${port.idx}`
    const entries: CatalogEntry[] = [
      { kind: "sensor", capability: PortLinkSensor.id, params, label: `${label} link`, value: Value.boolean(port.state === "UP") },
      { kind: "sensor", capability: PortSpeedSensor.id, params, label: `${label} speed`, value: Value.number(port.state === "UP" ? port.speedMbps ?? 0 : 0), unit: "Mbit/s" }
    ]
    if (port.poe) {
      entries.push({ kind: "sensor", capability: PortPoeSensor.id, params, label: `${label} PoE`, value: Value.string(port.poe.enabled ? port.poe.state : "OFF") })
      entries.push({ kind: "actuator", capability: PortPowerCycleActuator.id, params, label: `${label} power-cycle` })
    }
    return { label: `Port ${port.idx}`, entries }
  }
}
