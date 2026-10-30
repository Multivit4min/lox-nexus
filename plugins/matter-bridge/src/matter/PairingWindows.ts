import { AdministratorCommissioning } from "@matter/main/clusters/administrator-commissioning"

const { CommissioningWindowStatus } = AdministratorCommissioning

/**
 * Which pairing window is open: `basic` takes the bridge's own code; `enhanced` is one a paired
 * controller opened to share the bridge, with a code only that controller's app shows.
 */
export type PairingWindow = "closed" | "basic" | "enhanced"

/** where pairing stands, for the panel */
export interface PairingStatus {
  commissioned: boolean
  manualCode: string
  qrCode: string
  window: PairingWindow
  /** when the window opened with "Open pairing window" closes */
  windowUntil?: number
}

/** a paired controller (a fabric), without matter.js's BigInt ids */
export interface Controller { fabricIndex: number; vendorId: number; label: string }

/** Maps matter.js's commissioning window status to the bridge's view of it. */
export class PairingWindows {
  static of(status: AdministratorCommissioning.CommissioningWindowStatus): PairingWindow {
    if (status === CommissioningWindowStatus.BasicWindowOpen) return "basic"
    return status === CommissioningWindowStatus.EnhancedWindowOpen ? "enhanced" : "closed"
  }
}
