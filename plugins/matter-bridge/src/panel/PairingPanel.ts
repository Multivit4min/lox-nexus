import type { Panel, PanelPart } from "@lox-nexus/plugin-sdk"
import { OpenPairingWindowAction } from "../actions/OpenPairingWindowAction.ts"
import type { BridgeNode } from "../matter/BridgeNode.ts"
import type { PairingStatus } from "../matter/PairingWindows.ts"

/** what the panel reads from the bridge */
export type PairingSource = Pick<BridgeNode, "state" | "pairing" | "controllers">

type Section = Extract<Panel, { type: "sections" }>["sections"][number]

/**
 * Where pairing stands, at the top of the instance page: a notice while the bridge isn't paired
 * or running, else whether a window is open (counting down to its end), and the QR code while the
 * bridge's own code works.
 */
export class PairingPanel {
  constructor(private readonly bridge: PairingSource) {}

  sections(): Section[] {
    const status = this.bridge.pairing()
    const actions = [{ action: OpenPairingWindowAction.id }]
    if (!status) return [{ title: "Pairing", panel: this.stopped(), actions }]
    const sections: Section[] = [{ title: "Pairing", panel: PairingPanel.status(status), actions }]
    if (!status.commissioned || status.window === "basic") sections.push({ title: "Pairing code", panel: PairingPanel.qr(status) })
    return sections
  }

  /** the QR code with the manual code under it, for the panel and Open pairing window's answer */
  static qr(status: PairingStatus): PanelPart {
    return { type: "qr", data: status.qrCode, caption: `Manual pairing code ${PairingPanel.groupCode(status.manualCode)}` }
  }

  /** 11 digits as 4-3-4, as the apps print them */
  static groupCode(code: string) {
    return code.length === 11 ? `${code.slice(0, 4)}-${code.slice(4, 7)}-${code.slice(7)}` : code
  }

  private stopped(): PanelPart {
    if (this.bridge.state === "resetting") {
      return { type: "notice", tone: "info", title: "Resetting", text: "The last controller was removed. The bridge is back in a few seconds and waits to be paired again" }
    }
    return { type: "notice", tone: "warn", title: "Not running", text: "The Matter bridge is not running; the log below says why" }
  }

  private static status(status: PairingStatus): PanelPart {
    if (!status.commissioned) {
      const text = status.window === "closed"
        ? "The pairing window has closed: run Open pairing window, then scan the code below"
        : "Scan the code below in the Alexa, Google Home, Apple Home or Home Assistant app, or enter the manual pairing code"
      return { type: "notice", tone: "warn", title: "Not paired yet", text }
    }
    const paired = { label: "Paired", value: { text: "yes", tone: "ok" as const } }
    // a window a controller opened to share the bridge takes that app's code, not the bridge's own
    if (status.window === "enhanced") {
      return { type: "keyValue", items: [paired, { label: "Pairing window", value: { text: "opened by a paired app to share the bridge; use the code that app shows", tone: "info" } }] }
    }
    if (status.window === "basic") {
      const until = status.windowUntil === undefined ? {} : { until: status.windowUntil }
      return { type: "keyValue", items: [paired, { label: "Pairing window", value: { text: "open for another app", tone: "warn", ...until } }] }
    }
    return { type: "keyValue", items: [paired, { label: "Pairing window", value: { text: "closed; Open pairing window to add another app", tone: "muted" } }] }
  }
}
