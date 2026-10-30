import type { Panel, PanelPart } from "@lox-nexus/plugin-sdk"
import { AddDeviceAction } from "../actions/AddDeviceAction.ts"
import { EditDeviceAction } from "../actions/EditDeviceAction.ts"
import { EditLockAction } from "../actions/EditLockAction.ts"
import { OpenPairingWindowAction } from "../actions/OpenPairingWindowAction.ts"
import { RemoveDeviceAction } from "../actions/RemoveDeviceAction.ts"
import { RemovePairingAction } from "../actions/RemovePairingAction.ts"
import type { BridgedDevice, Recorded } from "../devices/BridgedDevice.ts"
import type { CommandKind, StateKind } from "../devices/DeviceKinds.ts"
import type { BridgeNode } from "../matter/BridgeNode.ts"
import type { PairingStatus } from "../matter/PairingWindows.ts"
import { Vendors } from "../matter/Vendors.ts"
import { KindFormat } from "./KindFormat.ts"

/** what the panel reads from the bridge */
export type PairingSource = Pick<BridgeNode, "state" | "pairing" | "controllers">

/**
 * The instance page: pairing (the QR code while the bridge's own code works), the paired
 * controllers with a Remove button each, and every device with what was last commanded and shown.
 */
export class BridgePanel {
  constructor(private readonly bridge: PairingSource, private readonly devices: readonly BridgedDevice[], private readonly timeZone: string) {}

  build(): Panel {
    return {
      type: "sections",
      sections: [
        { title: "Pairing", panel: this.pairing(), actions: [{ action: OpenPairingWindowAction.id }] },
        { title: "Controllers", panel: this.controllers() },
        { title: "Devices", panel: this.deviceTable(), actions: [{ action: AddDeviceAction.id }] }
      ]
    }
  }

  private pairing(): PanelPart {
    const status = this.bridge.pairing()
    if (!status) {
      const value = this.bridge.state === "resetting" ? "resetting after its last controller was removed; back in a few seconds" : "not running"
      return { type: "keyValue", items: [{ label: "Bridge", value }] }
    }
    // a window a controller opened to share the bridge takes that app's code, not the bridge's own
    if (status.window === "enhanced") {
      return {
        type: "keyValue",
        items: [
          { label: "Paired", value: status.commissioned ? "yes" : "no" },
          { label: "Pairing window", value: "opened by a paired app to share the bridge; use the code that app shows" }
        ]
      }
    }
    if (!status.commissioned || status.window === "basic") return { type: "qr", data: status.qrCode, caption: this.caption(status) }
    return {
      type: "keyValue",
      items: [
        { label: "Paired", value: "yes" },
        { label: "Pairing window", value: "closed; Open pairing window to add another app" }
      ]
    }
  }

  private caption(status: PairingStatus) {
    const code = `Manual pairing code ${BridgePanel.groupCode(status.manualCode)}`
    if (status.window === "closed") return `${code}. The pairing window has closed: run Open pairing window first`
    if (status.windowUntil !== undefined) return `${code}. Open until ${this.time(status.windowUntil)} for another app`
    return `${code}. Scan this in the Alexa, Google Home, Apple Home or Home Assistant app`
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

  /** 11 digits as 4-3-4, as the apps print them */
  static groupCode(code: string) {
    return code.length === 11 ? `${code.slice(0, 4)}-${code.slice(4, 7)}-${code.slice(7)}` : code
  }
}
