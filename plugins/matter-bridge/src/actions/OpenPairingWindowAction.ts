import { Action } from "@lox-nexus/plugin-sdk"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { PairingPanel } from "../panel/PairingPanel.ts"

/**
 * Lets another app pair the bridge: Matter allows several (Alexa and Google Home and Apple Home).
 * Answers with the QR code and the manual pairing code; the panel shows them too while the window is open.
 */
export class OpenPairingWindowAction extends Action<MatterBridgePlugin> {
  static readonly id = "open-pairing-window"
  static readonly label = "Open pairing window"
  /** its button is in the Pairing section */
  static readonly placement = "panel"
  static readonly description = "For 15 minutes, another app (Google Home, Apple Home, Home Assistant, …) can add the bridge with the pairing code. Anyone on your network could pair during that time"

  async run() {
    const status = await this.plugin.openPairingWindow()
    const code = PairingPanel.groupCode(status.manualCode)
    const panel = PairingPanel.qr(status)
    if (!status.commissioned) return { message: `The bridge is not paired yet and waits for a controller. Scan the code, or enter ${code}`, panel }
    return { message: `Pairing window open for 15 minutes. In the other app, add a Matter device and scan the code, or enter ${code}`, panel }
  }
}
