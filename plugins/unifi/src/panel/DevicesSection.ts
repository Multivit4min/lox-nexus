import type { Cell, RowAction } from "@lox-nexus/plugin-sdk"
import { PowerCycleAction } from "../actions/PowerCycleAction.ts"
import { RestartDeviceAction } from "../actions/RestartDeviceAction.ts"
import type { Device, Port } from "../api/ApiSchemas.ts"
import { MacAddress } from "../api/MacAddress.ts"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import type { Section } from "./PanelTypes.ts"
import { StateTone } from "./StateTone.ts"

/** The adopted devices with a Restart button each, and the ports of switches with Power-cycle on PoE ports. */
export class DevicesSection {
  constructor(private readonly snapshot: NetworkSnapshot) {}

  sections(): Section[] {
    const devices = [...this.snapshot.devices].sort((a, b) => a.name.localeCompare(b.name))
    if (devices.length === 0) return []
    const sections: Section[] = [{
      title: "Devices",
      panel: {
        type: "table",
        columns: ["Device", "Model", "State", "IP address", "MAC address", "Firmware"],
        rows: devices.map(device => DevicesSection.row(device)),
        rowActions: devices.map(device => [DevicesSection.restart(device)])
      }
    }]
    const ports = this.ports(devices)
    if (ports.length > 0) {
      sections.push({
        title: "Ports",
        panel: { type: "table", columns: ["Device", "Port", "Link", "Speed", "PoE"], rows: ports.map(entry => entry.row), rowActions: ports.map(entry => entry.actions) }
      })
    }
    return sections
  }

  private static row(device: Device): Cell[] {
    const firmware: Cell = device.firmwareUpdatable
      ? { text: `${device.firmwareVersion ?? "?"}, update available`, tone: "warn" }
      : device.firmwareVersion ?? ""
    return [device.name, device.model, StateTone.device(device.state), device.ipAddress ?? "", MacAddress.normalize(device.macAddress), firmware]
  }

  private static restart(device: Device): RowAction {
    return { action: RestartDeviceAction.id, label: "Restart", instant: true, input: { device: MacAddress.normalize(device.macAddress) } }
  }

  private ports(devices: Device[]) {
    return devices.flatMap(device => (this.snapshot.extras.ports.get(device.id) ?? [])
      .slice().sort((a, b) => a.idx - b.idx)
      .map(port => ({ row: DevicesSection.portRow(device, port), actions: DevicesSection.portActions(device, port) })))
  }

  private static portRow(device: Device, port: Port): Cell[] {
    const speed = port.state === "UP" && port.speedMbps !== undefined ? `${port.speedMbps} Mbit/s` : ""
    const poe: Cell = port.poe ? StateTone.poe(port.poe.enabled, port.poe.state) : { text: "none", tone: "muted" }
    return [device.name, String(port.idx), StateTone.link(port.state), speed, poe]
  }

  // only a port with PoE switched on has power to cut
  private static portActions(device: Device, port: Port): RowAction[] {
    if (!port.poe?.enabled) return []
    return [{ action: PowerCycleAction.id, label: "Power-cycle", instant: true, input: { device: MacAddress.normalize(device.macAddress), port: port.idx } }]
  }
}
