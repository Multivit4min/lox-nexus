import type { Cell, RowAction } from "@lox-nexus/plugin-sdk"
import { WifiSwitchAction } from "../actions/WifiSwitchAction.ts"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import { PanelText } from "./PanelText.ts"
import type { Section } from "./PanelTypes.ts"

/** Each Wi-Fi network with a switch that turns it on or off (only name and state; never its security settings). */
export class WifiSection {
  constructor(private readonly snapshot: NetworkSnapshot) {}

  sections(): Section[] {
    const networks = this.snapshot.wifi
    if (!networks) {
      return [{ title: "Wi-Fi networks", panel: { type: "notice", tone: "warn", text: `Can't list the Wi-Fi networks: ${PanelText.clip(this.snapshot.wifiProblem ?? "unknown", 1000)}` } }]
    }
    if (networks.length === 0) return []
    const items = [...networks].sort((a, b) => a.name.localeCompare(b.name)).map((network): { label: string; value: Cell; control: RowAction } => ({
      label: network.name,
      value: network.enabled ? { text: "on", tone: "ok" } : { text: "off", tone: "muted" },
      control: { action: WifiSwitchAction.id, switch: { checked: network.enabled }, input: { network: network.id, enabled: !network.enabled } }
    }))
    return [{ title: "Wi-Fi networks", panel: { type: "keyValue", items } }]
  }
}
