import type { Cell, Panel, PanelPart } from "@lox-nexus/plugin-sdk"
import type { Poller } from "./Poller.ts"
import type { FroniusSnapshot } from "./SolarApiTypes.ts"

type Tile = Extract<PanelPart, { type: "tiles" }>["tiles"][number]

/** The status view on the plugin's page: the power flow as tiles, and how polling goes. */
export class FroniusPanel {
  constructor(private readonly poller: Pick<Poller, "latest" | "lastSuccess" | "lastError" | "problem">) {}

  build(): Panel {
    return {
      type: "sections",
      sections: [
        { title: "Power flow", panel: { type: "tiles", tiles: this.tiles() } },
        { title: "Inverter", panel: { type: "keyValue", items: this.status() } }
      ]
    }
  }

  /** battery tiles appear only when the inverter reports a battery; missing readings show as a dash */
  private tiles(): Tile[] {
    const site = this.poller.latest?.powerflow.Site
    const watts = (label: string, value: number | null | undefined, hint: string): Tile => ({ label, value: FroniusPanel.number(value), unit: "W", decimals: 0, hint })
    const tiles = [
      watts("Photovoltaics", site?.P_PV, "what the panels produce"),
      // Fronius's signs, as the sensors give them
      watts("Grid", site?.P_Grid, "+ from the grid, − to the grid"),
      watts("Load", site?.P_Load, "the house's use, negative")
    ]
    if (typeof site?.P_Akku === "number") tiles.push(watts("Battery", site.P_Akku, "+ discharging, − charging"))
    const soc = FroniusPanel.stateOfCharge(this.poller.latest)
    if (soc !== undefined) tiles.push({ label: "Battery charge", value: soc, unit: "%", decimals: 1, min: 0, max: 100 })
    if (typeof site?.rel_Autonomy === "number") tiles.push({ label: "Autonomy", value: site.rel_Autonomy, unit: "%", decimals: 1, min: 0, max: 100, hint: "the share of the load not taken from the grid" })
    return tiles
  }

  private status() {
    const items: { label: string; value: Cell }[] = [
      { label: "Reading", value: this.reading() },
      { label: "Last successful poll", value: this.poller.lastSuccess?.toISOString() ?? "never" }
    ]
    const error = this.poller.lastError
    // an error the inverter has recovered from stays for reference, greyed
    if (error) items.push({ label: "Last error", value: { text: `${error.message} (${error.at.toISOString()})`, tone: this.poller.problem ? "error" : "muted" } })
    return items
  }

  private reading(): Cell {
    if (this.poller.problem) return { text: `can't read the inverter: ${this.poller.problem}`, tone: "error" }
    return this.poller.lastSuccess ? { text: "ok", tone: "ok" } : { text: "waiting for the first poll", tone: "muted" }
  }

  /** the battery's own reading when there is one, otherwise what the hybrid inverter reports */
  private static stateOfCharge(snapshot: FroniusSnapshot | undefined) {
    const storage = Object.values(snapshot?.storage ?? {})[0]?.Controller.StateOfCharge_Relative
    if (typeof storage === "number") return storage
    const inverter = Object.values(snapshot?.powerflow.Inverters ?? {}).find(entry => typeof entry.SOC === "number")
    return inverter?.SOC ?? undefined
  }

  private static number(value: number | null | undefined) {
    return typeof value === "number" ? value : null
  }
}
