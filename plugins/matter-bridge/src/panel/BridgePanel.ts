import type { Panel, PanelPart } from "@lox-nexus/plugin-sdk"
import { AddDeviceAction } from "../actions/AddDeviceAction.ts"
import { EditDeviceAction } from "../actions/EditDeviceAction.ts"
import { EditLockAction } from "../actions/EditLockAction.ts"
import { RemoveDeviceAction } from "../actions/RemoveDeviceAction.ts"
import { RemovePairingAction } from "../actions/RemovePairingAction.ts"
import type { BridgedDevice, Recorded } from "../devices/BridgedDevice.ts"
import type { CommandKind, StateKind } from "../devices/DeviceKinds.ts"
import { Vendors } from "../matter/Vendors.ts"
import { KindFormat } from "./KindFormat.ts"
import { PairingPanel, type PairingSource } from "./PairingPanel.ts"

/**
 * The instance page: pairing (PairingPanel), the paired controllers with a Remove button each, and every device with what was last commanded and shown.
 */
export class BridgePanel {
  constructor(private readonly bridge: PairingSource, private readonly devices: readonly BridgedDevice[], private readonly timeZone: string) {}

  build(): Panel {
    return {
      type: "sections",
      sections: [
        ...new PairingPanel(this.bridge).sections(),
        { title: "Controllers", panel: this.controllers() },
        { title: "Devices", panel: this.deviceTable(), actions: [{ action: AddDeviceAction.id }] }
      ]
    }
  }

  private controllers(): PanelPart {
    const controllers = this.bridge.controllers()
    if (controllers.length === 0) return { type: "keyValue", items: [{ label: "Paired controllers", value: "none" }] }
    return {
      type: "table",
      columns: ["Controller", "Vendor id", "Fabric index"],
      rows: controllers.map(({ label, vendorId, fabricIndex }) => [Vendors.describe(label, vendorId), Vendors.hex(vendorId), String(fabricIndex)]),
      rowActions: controllers.map(({ fabricIndex }) => [{ action: RemovePairingAction.id, label: "Remove", input: { fabricIndex } }])
    }
  }

  private deviceTable(): PanelPart {
    if (this.devices.length === 0) return { type: "keyValue", items: [{ label: "Devices", value: "No devices yet: Add device above" }] }
    return {
      type: "table",
      columns: ["Device", "Id", "Type", "Last command from a controller", "Last state from Nexus"],
      rows: this.devices.map(device => {
        // a thermostat's "21 °C" could be either value: name it where a device has several
        const labeled = device.info.states.length > 1
        return [device.name, device.id, device.info.label, this.recorded(device.lastCommand, labeled), this.recorded(device.lastState, labeled)]
      }),
      rowActions: this.devices.map(device => [
        // a lock's form has Allow unlocking, prefilled with what the lock has
        device.type === "door-lock"
          ? { action: EditLockAction.id, label: "Edit", input: { device: device.id, name: device.name, allowUnlock: device.allowUnlock } }
          : { action: EditDeviceAction.id, label: "Edit", input: { device: device.id, name: device.name } },
        { action: RemoveDeviceAction.id, label: "Remove", input: { device: device.id } }
      ])
    }
  }

  /** with the kind in front where the device has several ("temperature 21.5 °C" on a thermostat) */
  private recorded(entry: Recorded<StateKind | CommandKind> | undefined, labeled: boolean) {
    if (!entry) return "–"
    const value = labeled ? KindFormat.labeled(entry.kind, entry.value) : KindFormat.value(entry.kind, entry.value)
    return `${value} at ${this.time(entry.at)}`
  }

  private time(at: number) {
    return new Date(at).toLocaleTimeString("en-GB", { timeZone: this.timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit" })
  }
}
