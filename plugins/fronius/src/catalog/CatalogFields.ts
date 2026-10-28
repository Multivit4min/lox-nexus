/**
 * A known field of a Solar API object, as offered in the catalog.
 * `nullable`: listed even while null, because null is only temporary (PV power at night). Other
 * fields that are null mean the component isn't there (no meter, no battery) and stay hidden.
 */
export interface CatalogField {
  key: string
  label: string
  nullable?: true
}

/** Display names and the fields worth offering, per Solar API object. */
export class CatalogFields {
  static readonly site: readonly CatalogField[] = [
    { key: "P_PV", label: "PV power", nullable: true },
    { key: "P_Grid", label: "Grid power (+ import, - export)" },
    { key: "P_Load", label: "Load power (- consumption)" },
    { key: "P_Akku", label: "Battery power (+ discharge, - charge)" },
    { key: "rel_Autonomy", label: "Autonomy" },
    { key: "rel_SelfConsumption", label: "Self-consumption" },
    { key: "E_Day", label: "Energy produced today" },
    { key: "E_Year", label: "Energy produced this year" },
    { key: "E_Total", label: "Energy produced in total" },
    { key: "Mode", label: "System mode" },
    { key: "BackupMode", label: "Backup mode" },
    { key: "BatteryStandby", label: "Battery standby" }
  ]

  static readonly inverter: readonly CatalogField[] = [
    { key: "P", label: "AC power", nullable: true },
    { key: "SOC", label: "battery state of charge" },
    { key: "Battery_Mode", label: "battery mode" },
    { key: "E_Day", label: "energy produced today" },
    { key: "E_Year", label: "energy produced this year" },
    { key: "E_Total", label: "energy produced in total" }
  ]

  static readonly meter: readonly CatalogField[] = [
    { key: "PowerReal_P_Sum", label: "power" },
    ...CatalogFields.phases("PowerReal_P_Phase_", "power L"),
    { key: "PowerApparent_S_Sum", label: "apparent power" },
    { key: "PowerReactive_Q_Sum", label: "reactive power" },
    { key: "PowerFactor_Sum", label: "power factor" },
    ...CatalogFields.phases("Voltage_AC_Phase_", "voltage L"),
    { key: "Voltage_AC_PhaseToPhase_12", label: "voltage L1-L2" },
    { key: "Voltage_AC_PhaseToPhase_23", label: "voltage L2-L3" },
    { key: "Voltage_AC_PhaseToPhase_31", label: "voltage L3-L1" },
    { key: "Current_AC_Sum", label: "current total" },
    ...CatalogFields.phases("Current_AC_Phase_", "current L"),
    { key: "Frequency_Phase_Average", label: "frequency" },
    { key: "EnergyReal_WAC_Sum_Consumed", label: "energy consumed (total)" },
    { key: "EnergyReal_WAC_Sum_Produced", label: "energy produced (total)" },
    { key: "EnergyReal_WAC_Plus_Absolute", label: "energy imported (total)" },
    { key: "EnergyReal_WAC_Minus_Absolute", label: "energy exported (total)" }
  ]

  static readonly storage: readonly CatalogField[] = [
    { key: "StateOfCharge_Relative", label: "state of charge" },
    { key: "Temperature_Cell", label: "cell temperature" },
    { key: "Voltage_DC", label: "DC voltage" },
    { key: "Current_DC", label: "DC current" },
    { key: "Capacity_Maximum", label: "maximum capacity" },
    { key: "DesignedCapacity", label: "designed capacity" }
  ]

  static readonly ohmpilot: readonly CatalogField[] = [
    { key: "P_AC_Total", label: "heating power" },
    { key: "State", label: "state" },
    { key: "Temperature", label: "water temperature" }
  ]

  /** the unit the Solar API reports a field in, from its name; undefined for counts, modes and ratios */
  static unit(key: string): string | undefined {
    const units: Array<[RegExp, string]> = [
      [/^rel_|^SOC$|StateOfCharge/, "%"], [/^E_|^Energy|Capacity/, "Wh"], [/^PowerApparent/, "VA"],
      [/^PowerReactive/, "var"], [/^P(_|$)|^PowerReal/, "W"], [/^Voltage/, "V"], [/^Current/, "A"],
      [/^Frequency/, "Hz"], [/Temperature/, "°C"]
    ]
    return units.find(([pattern]) => pattern.test(key))?.[1]
  }

  private static phases(prefix: string, label: string): CatalogField[] {
    return [1, 2, 3].map(phase => ({ key: `${prefix}${phase}`, label: `${label}${phase}` }))
  }
}
