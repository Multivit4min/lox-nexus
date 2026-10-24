import type { Panel } from "@lox-nexus/plugin-sdk"
import type { Poller } from "./Poller.ts"
import type { FroniusSnapshot } from "./SolarApiTypes.ts"

type Item = { label: string; value: string }

/** The status view on the plugin's page: current power flow and how polling goes. */
export class FroniusPanel {
  constructor(private readonly poller: Pick<Poller, "latest" | "lastSuccess" | "lastError">) {}

  /** battery rows appear only when the inverter reports a battery; missing readings show as a dash */
  build(): Panel {
    const site = this.poller.latest?.powerflow.Site
    const items: Item[] = [
      { label: "Photovoltaics", value: FroniusPanel.unit(site?.P_PV, "W") },
      { label: "Grid", value: FroniusPanel.unit(site?.P_Grid, "W") },
      { label: "Load", value: FroniusPanel.unit(site?.P_Load, "W") }
    ]
    if (typeof site?.P_Akku === "number") items.push({ label: "Battery", value: FroniusPanel.unit(site.P_Akku, "W") })
    const soc = FroniusPanel.stateOfCharge(this.poller.latest)
    if (soc !== undefined) items.push({ label: "Battery charge", value: FroniusPanel.unit(soc, "%", 1) })
    if (typeof site?.rel_Autonomy === "number") items.push({ label: "Autonomy", value: FroniusPanel.unit(site.rel_Autonomy, "%", 1) })
    items.push({ label: "Last successful poll", value: this.poller.lastSuccess?.toISOString() ?? "never" })
    const error = this.poller.lastError
    if (error) items.push({ label: "Last error", value: `${error.message} (${error.at.toISOString()})` })
    return { type: "keyValue", items }
  }

  /** the battery's own reading when there is one, otherwise what the hybrid inverter reports */
  private static stateOfCharge(snapshot: FroniusSnapshot | undefined) {
    const storage = Object.values(snapshot?.storage ?? {})[0]?.Controller.StateOfCharge_Relative
    if (typeof storage === "number") return storage
    const inverter = Object.values(snapshot?.powerflow.Inverters ?? {}).find(entry => typeof entry.SOC === "number")
    return inverter?.SOC ?? undefined
  }

  private static unit(value: number | null | undefined, unit: string, decimals = 0) {
    return typeof value === "number" ? `${value.toFixed(decimals)} ${unit}` : "–"
  }
}
