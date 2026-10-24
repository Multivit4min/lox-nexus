// Response shapes of Fronius Solar API v1 (Body.Data of each endpoint). Every field is optional
// because what a device reports depends on its model, firmware and the connected components.

/** a reading that is null while the component is inactive (inverter asleep, no meter, no battery) */
export type Reading = number | null

/** GetPowerFlowRealtimeData: Site */
export interface PowerFlowSite {
  /** "produce-only", "meter", "vague-meter", "bidirectional" or "ac-coupled" */
  Mode?: string
  /** + production; on GEN24 and Symo Hybrid the DC side (PV generator) */
  P_PV?: Reading
  /** + from grid, - to grid; null without a meter */
  P_Grid?: Reading
  /** + generator, - consumer; null without a meter */
  P_Load?: Reading
  /** + discharge, - charge; null without an active battery */
  P_Akku?: Reading
  rel_Autonomy?: Reading
  rel_SelfConsumption?: Reading
  /** Wh; always null on GEN24, Tauro and Verto */
  E_Day?: Reading
  E_Year?: Reading
  /** Wh; updated only every 5 minutes on GEN24 */
  E_Total?: Reading
  Meter_Location?: string
  BackupMode?: boolean
  BatteryStandby?: boolean
}

/** GetPowerFlowRealtimeData: Inverters[id] */
export interface PowerFlowInverter {
  DT?: number
  /** W on the AC side; null while not running */
  P?: Reading
  /** % state of charge of the attached battery */
  SOC?: Reading
  Battery_Mode?: string
  E_Day?: Reading
  E_Year?: Reading
  E_Total?: Reading
}

/** GetPowerFlowRealtimeData: Smartloads.Ohmpilots[id] */
export interface PowerFlowOhmpilot {
  P_AC_Total?: number
  State?: string
  Temperature?: number
}

export interface PowerFlowData {
  Site: PowerFlowSite
  Inverters?: Record<string, PowerFlowInverter>
  SecondaryMeters?: Record<string, { Category?: string; Label?: string; Mloc?: number; P?: number }>
  Smartloads?: { Ohmpilots?: Record<string, PowerFlowOhmpilot> }
  Version?: string
}

export interface DeviceDetails {
  Manufacturer?: string
  Model?: string
  Serial?: string
}

/** GetMeterRealtimeData: one meter (Scope=Device), or each entry of Scope=System */
export type MeterData = { Details?: DeviceDetails } & Partial<Record<string, unknown>>

/** GetStorageRealtimeData: Controller of one storage */
export interface StorageController {
  Details?: DeviceDetails
  StateOfCharge_Relative?: number
  Temperature_Cell?: number
  Voltage_DC?: number
  Current_DC?: number
  Capacity_Maximum?: number
  DesignedCapacity?: number
  Enable?: number
}

/** GetStorageRealtimeData: one storage (Scope=Device), or each entry of Scope=System */
export interface StorageData {
  Controller: StorageController
  Modules?: unknown[]
}

/**
 * What one poll gathered; the ValueSensor's paths start at this object. Meter and storage are
 * undefined when their endpoint failed (many devices have neither).
 */
export interface FroniusSnapshot {
  powerflow: PowerFlowData
  meter?: Record<string, MeterData>
  storage?: Record<string, StorageData>
}
