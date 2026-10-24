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
    { key: "P_PV", label: "Photovoltaics power", nullable: true },
    { key: "P_Grid", label: "Grid power (+ import, - export)" },
    { key: "P_Load", label: "Load power (- consumption)" },
    { key: "P_Akku", label: "Battery power (+ discharge, - charge)" },
    { key: "rel_Autonomy", label: "Autonomy" },
    { key: "rel_SelfConsumption", label: "Self consumption" },
    { key: "E_Day", label: "Energy today" },
    { key: "E_Year", label: "Energy this year" },
    { key: "E_Total", label: "Energy total" },
    { key: "Mode", label: "Mode" },
    { key: "BackupMode", label: "Backup mode" },
    { key: "BatteryStandby", label: "Battery standby" }
  ]

  static readonly inverter: readonly CatalogField[] = [
    { key: "P", label: "power", nullable: true },
    { key: "SOC", label: "battery state of charge" },
    { key: "Battery_Mode", label: "battery mode" },
    { key: "E_Day", label: "energy today" },
    { key: "E_Year", label: "energy this year" },
    { key: "E_Total", label: "energy total" }
  ]

  static readonly meter: readonly CatalogField[] = [
    { key: "PowerReal_P_Sum", label: "power" },
    ...CatalogFields.phases("PowerReal_P_Phase_", "power phase "),
    { key: "PowerApparent_S_Sum", label: "apparent power" },
    { key: "PowerReactive_Q_Sum", label: "reactive power" },
    { key: "PowerFactor_Sum", label: "power factor" },
    ...CatalogFields.phases("Voltage_AC_Phase_", "voltage phase "),
    { key: "Voltage_AC_PhaseToPhase_12", label: "voltage phase 1 to 2" },
    { key: "Voltage_AC_PhaseToPhase_23", label: "voltage phase 2 to 3" },
    { key: "Voltage_AC_PhaseToPhase_31", label: "voltage phase 3 to 1" },
    { key: "Current_AC_Sum", label: "current" },
    ...CatalogFields.phases("Current_AC_Phase_", "current phase "),
    { key: "Frequency_Phase_Average", label: "frequency" },
    { key: "EnergyReal_WAC_Sum_Consumed", label: "energy consumed" },
    { key: "EnergyReal_WAC_Sum_Produced", label: "energy produced" },
    { key: "EnergyReal_WAC_Plus_Absolute", label: "energy imported" },
    { key: "EnergyReal_WAC_Minus_Absolute", label: "energy exported" }
  ]

  static readonly storage: readonly CatalogField[] = [
    { key: "StateOfCharge_Relative", label: "state of charge" },
    { key: "Temperature_Cell", label: "cell temperature" },
    { key: "Voltage_DC", label: "voltage" },
    { key: "Current_DC", label: "current" },
    { key: "Capacity_Maximum", label: "maximum capacity" },
    { key: "DesignedCapacity", label: "designed capacity" }
  ]

  static readonly ohmpilot: readonly CatalogField[] = [
    { key: "P_AC_Total", label: "power" },
    { key: "State", label: "state" },
    { key: "Temperature", label: "temperature" }
  ]

  private static phases(prefix: string, label: string): CatalogField[] {
    return [1, 2, 3].map(phase => ({ key: `${prefix}${phase}`, label: `${label}${phase}` }))
  }
}
