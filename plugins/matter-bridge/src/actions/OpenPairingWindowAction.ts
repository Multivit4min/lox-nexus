import { Action } from "@lox-nexus/plugin-sdk"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { BridgePanel } from "../panel/BridgePanel.ts"

/**
 * Lets another app pair the bridge: Matter allows several (Alexa and Google Home and Apple Home).
 * Answers with the manual pairing code; the panel shows the QR code while the window is open.
 */
export class OpenPairingWindowAction extends Action<MatterBridgePlugin> {
  static readonly id = "open-pairing-window"
  static readonly label = "Open pairing window"
  static readonly description = "For 15 minutes, another app (Google Home, Apple Home, Home Assistant, …) can add the bridge with the pairing code. Anyone on your network could pair during that time"

  async run() {
    const status = await this.plugin.bridge.openPairingWindow()
    const code = BridgePanel.groupCode(status.manualCode)
    if (!status.commissioned) return `The bridge is not paired yet and waits for a controller. Pairing code: ${code} (or scan the QR code on this page)`
    return `Pairing window open for 15 minutes. In the other app, add a Matter device and enter the code ${code}, or scan the QR code on this page`
  }
}
